## ADDED Requirements

### Requirement: Typed event bus is a generic subclass of `node:events` `EventEmitter`

The kiosk runtime SHALL provide a `TypedEventBus<M>` class in `src/backend/kiosk/events/bus.ts` that extends `node:events`' `EventEmitter` with a generic type parameter `M extends Record<string, unknown>` describing the event map.

The class SHALL `override` the four hot methods so each one is type-checked against the event name:

- `on<K extends keyof M & string>(event: K, listener: (payload: M[K]) => void): this`
- `once<K extends keyof M & string>(event: K, listener: (payload: M[K]) => void): this`
- `off<K extends keyof M & string>(event: K, listener: (payload: M[K]) => void): this`
- `emit<K extends keyof M & string>(event: K, payload: M[K]): boolean`

`emit` SHALL invoke each registered listener inside its own `try/catch` and log any thrown exception (without re-throwing), so a single buggy listener cannot abort fan-out to the remaining listeners or propagate into the ingest call site.

The event map for the kiosk runtime SHALL be exported as `RaceEventMap` and SHALL include at least the key `lap` (typed payload defined by the lap-event requirement below). The map MUST NOT include a key named `error` — domain failures travel as their own typed events (e.g. a future `alert` event), and Node's special-case re-throw on `error` is not desired here.

The unchanged niceties of the base `EventEmitter` (`once`, `removeAllListeners`, `setMaxListeners`, `listenerCount`, `eventNames`) SHALL remain available to consumers via inheritance.

#### Scenario: TypedEventBus extends EventEmitter
- **WHEN** a developer imports `TypedEventBus` and inspects its prototype chain
- **THEN** `TypedEventBus.prototype instanceof EventEmitter` is `true`

#### Scenario: `emit` payload is type-checked against the event name
- **WHEN** a developer writes `bus.emit('lap', { lap: 'oops' })` against a `RaceEventMap` whose `lap` payload is a `LapEvent` object
- **THEN** the TypeScript compiler reports a type error at the `emit` call (the string `'oops'` is not assignable to `LapEvent['lap']: number`)

#### Scenario: Listener exception does not abort fan-out
- **WHEN** two listeners are registered for `lap`, the first throws an `Error`, and `bus.emit('lap', validLapEvent)` is called
- **THEN** the thrown error is logged, the second listener is still invoked with the same payload, and `emit` itself does not throw

#### Scenario: `error` is not part of the kiosk event map
- **WHEN** a developer inspects the exported `RaceEventMap` type
- **THEN** it does not contain a key named `error`

### Requirement: Track centerline is loaded once at boot from `KIOSK_TRACK_PATH`

The kiosk runtime SHALL expose a `loadCenterline(path: string): Centerline` function in `src/backend/kiosk/events/centerline.ts` (or a sibling module) that:

1. Reads the GPX file at `path` synchronously-on-await via `Bun.file(path).text()`.
2. Parses `<trkpt lat="…" lon="…">` elements in document order.
3. Returns a `Centerline` object exposing:
   - `totalMeters: number` — sum of haversine distances between successive `<trkpt>` points.
   - `points: { lat: number; lon: number; cumulativeMeters: number }[]`.
   - `project(lat: number, lon: number): { sM: number; s: number; sector: 0 | 1 | 2 | 3 }` — projects a coordinate onto the nearest centerline segment and returns its arc-length position, normalized progress `s = sM / totalMeters ∈ [0, 1)`, and the sector index from `SECTOR_BOUNDARIES_S`.

`SECTOR_BOUNDARIES_S` SHALL be an exported constant `[0, 0.25, 0.5, 0.75]` until the track is surveyed; sector `i` covers `s ∈ [SECTOR_BOUNDARIES_S[i], SECTOR_BOUNDARIES_S[i+1])` (with sector 3 wrapping to 1.0).

If the file is missing, unreadable, or contains fewer than two distinct `<trkpt>` points, `loadCenterline` SHALL throw synchronously at construction time with an error whose message includes the resolved absolute path.

`KIOSK_TRACK_PATH` SHALL default to `src/backend/kiosk/__fixtures__/track.gpx` when unset — matching the simulator's existing default — so a fresh checkout boots with no extra configuration.

The function MUST NOT read any other environment variable, open any DB, or perform any I/O beyond reading the GPX file.

#### Scenario: Centerline loads from the default GPX
- **WHEN** `loadCenterline` is called with the default `KIOSK_TRACK_PATH`
- **THEN** it returns a `Centerline` whose `totalMeters > 0` and whose `points.length >= 2`

#### Scenario: Missing GPX file fails fast
- **WHEN** `loadCenterline('/tmp/does-not-exist.gpx')` is called
- **THEN** it throws synchronously with a message that contains the offending path

#### Scenario: Project returns normalized progress on the polyline
- **WHEN** a sample on (or near) the first `<trkpt>` is projected
- **THEN** the result has `s ≈ 0` (within 1/totalMeters) and `sector === 0`

### Requirement: Lap detector consumes decoded samples and tracks unwrapped progress

The kiosk runtime SHALL provide a `createLapDetector({ db, centerline, bus })` factory in `src/backend/kiosk/events/lap.ts` that returns an object with at least a `handleSample(sample: DecodedSample): void` method.

`handleSample` SHALL be wired as `runIngest`'s `onSample` callback. For each sample it SHALL:

1. If `sample.fix === 0`, drop the sample (no projection, no state update).
2. Project `{ sample.lat, sample.lon }` via `centerline.project(...)` to obtain `{ sM, s, sector }`.
3. Maintain an `unwrappedDistanceM` counter that monotonically tracks the car's arc-length progress around the track:
   - On the first projected sample after boot: initialize `unwrappedDistanceM = sM`, record `lastSM = sM`, record `lastT = sample.t`, set `currentSector = sector`, do NOT emit a lap.
   - On subsequent samples: compute `delta = sM - lastSM`; if `delta < -centerline.totalMeters / 2`, wrap by adding `centerline.totalMeters` to `delta`. Update `unwrappedDistanceM += delta` and `lastSM = sM`.
4. Detect a lap boundary when `floor(unwrappedDistanceM / centerline.totalMeters)` increments compared to the previous sample.
5. Between boundaries, accumulate the inter-sample time `dt = sample.t - lastT` into `splits[currentSector]` and update `lastT = sample.t`, `currentSector = sector`.

Successive lap boundaries SHALL be separated by at least `MIN_LAP_DISTANCE_M = centerline.totalMeters * 0.9` of unwrapped progress; a boundary that would fire before this threshold is suppressed and treated as GPS jitter near the line.

The factory MUST NOT open the DB itself; it receives an already-constructed Drizzle client via DI and is invoked from `bootKiosk` after the client is open.

#### Scenario: Sample without GPS fix is dropped
- **WHEN** `handleSample` receives a sample with `fix === 0`
- **THEN** the internal state (`unwrappedDistanceM`, `lastSM`, `splits`) does not change and no `lap` event is emitted

#### Scenario: First sample bootstraps state without emitting
- **WHEN** a fresh detector receives its first valid sample
- **THEN** no `lap` event is emitted regardless of where on the track the sample falls

#### Scenario: GPS noise near the start line does not fire a spurious lap
- **WHEN** the detector receives a sequence of samples whose `s` oscillates around `0` / `1` boundary across `< MIN_LAP_DISTANCE_M` of unwrapped progress
- **THEN** no `lap` event is emitted

### Requirement: First completed lap is treated as warmup

The lap detector SHALL discard the partial first lap of any kiosk session.

Concretely: between boot and the first detected lap boundary, the detector accumulates `unwrappedDistanceM` but emits no event. At the first boundary, it resets split accumulators and records `currentLapStartedAt = sample.t * 1000` (converting Unix seconds to Unix milliseconds), starting lap **1**. Lap 1 is emitted when the *second* boundary is reached, with splits accumulated between the first and second crossings.

The detector MUST NOT emit a `lap` event for the warmup interval, MUST NOT write a row into the `laps` table for it, and MUST tolerate a kiosk that boots with the car already mid-track without producing misleading split data.

#### Scenario: First boundary starts lap 1 silently
- **WHEN** the detector observes its first lap boundary (the car's first start/finish crossing after boot)
- **THEN** no `lap` event is emitted; the next boundary will produce lap **1**

#### Scenario: Lap 1 carries splits only from after the first crossing
- **WHEN** the second boundary fires
- **THEN** the emitted lap has `lap === 1`, `splits` reflecting only the interval between the first and second crossings, and `startedAt === <first crossing's sample.t in ms>`

### Requirement: Lap rows are persisted via Drizzle before the `lap` event is emitted

On every non-warmup lap boundary, the detector SHALL persist a single row into the `laps` table using the injected Drizzle client (`db.insert(laps).values({...})`), and only emit `bus.emit('lap', event)` AFTER the insert resolves successfully.

The detector MUST NOT use raw SQL strings; per the kiosk's persistence policy, all DB access goes through Drizzle.

If the insert throws, the detector SHALL log the error and continue processing subsequent samples without emitting the `lap` event for the failed row. State (`splits`, `currentLapStartedAt`, lap counter) SHALL advance as if the lap had been recorded — the lap timing is lost but the detector does not stall or double-count subsequent laps.

Subscribers' exceptions raised inside their handler MUST NOT roll back the just-committed insert; the bus's per-listener `try/catch` (see the typed-bus requirement above) handles this.

#### Scenario: Lap is inserted before the event is emitted
- **WHEN** a lap boundary fires and the `laps` insert resolves successfully
- **THEN** any subscriber observing the `lap` event can `SELECT ... FROM laps WHERE lap = event.lap` inside its handler and find the row

#### Scenario: Insert failure suppresses the event
- **WHEN** the `laps` insert throws (e.g. DB closed, disk full)
- **THEN** the error is logged, no `lap` event is emitted, the detector continues processing subsequent samples, and the lap counter still advances so the next lap boundary produces `lap === currentLap + 1`

#### Scenario: A subscriber that throws does not affect persistence
- **WHEN** a registered `lap` listener throws after the row has been inserted
- **THEN** the inserted row is not rolled back, the thrown error is logged, and remaining listeners still receive the event

### Requirement: `lap` event payload shape

The `lap` event SHALL carry the following payload, which is the value of `RaceEventMap['lap']` and the type written into the `laps` table (modulo column naming):

```ts
type LapEvent = {
  lap: number;                                       // 1-based lap number
  timeSec: number;                                   // ended_at - started_at, in seconds
  splits: [number, number, number, number];         // seconds per sector (S1..S4)
  startedAt: number;                                 // Unix ms of the first sample of this lap
  endedAt: number;                                   // Unix ms of the boundary sample
};
```

`timeSec` SHALL equal the sum of `splits` within floating-point precision. `splits[i]` SHALL be non-negative for every `i`. `lap` SHALL be strictly monotonically increasing across the life of the process (and across kiosk reboots, since lap numbering is derived from `MAX(lap) + 1` queried at detector construction time — see the boot-wiring spec).

#### Scenario: Splits sum to total time
- **WHEN** a `lap` event is emitted
- **THEN** `Math.abs(event.timeSec - event.splits.reduce((a, b) => a + b, 0)) < 1e-6`

#### Scenario: Lap numbers do not skip or repeat
- **WHEN** five consecutive lap events are observed during a single uninterrupted session that began with lap 0 in `laps`
- **THEN** their `lap` values are `1, 2, 3, 4, 5` in order
