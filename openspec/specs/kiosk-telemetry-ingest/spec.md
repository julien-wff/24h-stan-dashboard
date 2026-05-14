# kiosk-telemetry-ingest Specification

## Purpose

Defines how the kiosk runtime obtains telemetry packets, validates them, and persists them through the database client provided by `kiosk-persistence`. This capability owns the `TelemetrySource` abstraction (simulator + fixture today; serial later), the ingest loop's per-packet contract (parse, validate, transactional write), and how kiosk boot wires the source, DB client, and ingest loop together.

## Requirements

### Requirement: Telemetry sources implement a uniform interface

The kiosk runtime SHALL define a `TelemetrySource` interface in `src/backend/kiosk/telemetry/source.ts` with at minimum:
- `lines(): AsyncIterable<string>` — yields newline-delimited JSON payloads as strings, exactly as received (no parsing, no validation).
- `stop(): Promise<void>` — idempotently stops the source and resolves once the iterable is fully drained.

A resolver function `resolveTelemetrySource(value: string, options?: { resume?: ResumeState }): TelemetrySource` SHALL map the value of `KIOSK_TELEMETRY_SOURCE` to an implementation. When `value` is empty or unset, the resolver SHALL behave as if it received `"simulated"`. The mapping:
- `"simulated"` → the live GPX-driven simulator implementation, constructed against the GPX path resolved from `KIOSK_TRACK_PATH` (default `src/backend/kiosk/__fixtures__/track.gpx`). If `options.resume.kind === "simulator"` and its `trackPath` matches the resolved GPX path, the resume state is passed to the simulator.
- `"fixture"` → a `FixtureSource` reading the bundled NDJSON at `src/backend/kiosk/__fixtures__/sample-session.ndjson`. If `options.resume.kind === "fixture"` and its `path` matches the bundled fixture path, the resume state is passed to the fixture.
- A value of the form `"fixture:<path>"` where `<path>` is a non-empty absolute or relative path → a `FixtureSource` against that path. The same resume-match rule applies. Empty or whitespace-only `<path>` SHALL throw an error stating the fixture path is missing.
- A value starting with `/dev/` or `tty` → throws an error stating that the serial telemetry source is not yet implemented.
- Any other value → throws an error naming the unknown value.

The ingest loop MUST consume only the `TelemetrySource` interface; it MUST NOT know which implementation it is talking to.

#### Scenario: Resolver returns the simulator for `simulated`
- **WHEN** `resolveTelemetrySource("simulated")` is called
- **THEN** it returns an object implementing `lines()` and `stop()` backed by the GPX-driven simulator

#### Scenario: Resolver defaults to simulator on empty input
- **WHEN** `resolveTelemetrySource("")` is called
- **THEN** it returns a GPX-driven simulator (same behavior as `"simulated"`)

#### Scenario: Resolver returns the bundled fixture for `fixture`
- **WHEN** `resolveTelemetrySource("fixture")` is called
- **THEN** it returns a `FixtureSource` whose lines match the bundled `sample-session.ndjson` file

#### Scenario: Resolver returns a fixture for an explicit path
- **WHEN** `resolveTelemetrySource("fixture:/tmp/custom.ndjson")` is called
- **THEN** it returns a `FixtureSource` configured against `/tmp/custom.ndjson`

#### Scenario: Resolver rejects a fixture value with an empty path
- **WHEN** `resolveTelemetrySource("fixture:")` is called
- **THEN** it throws an error whose message states that the fixture path is missing

#### Scenario: Resolver rejects the serial path with a clear message
- **WHEN** `resolveTelemetrySource("/dev/ttyUSB0")` is called
- **THEN** it throws an error whose message states that the serial telemetry source is not yet implemented

#### Scenario: Resolver rejects unknown values
- **WHEN** `resolveTelemetrySource("nonsense")` is called
- **THEN** it throws an error whose message includes the unrecognized value

#### Scenario: Ingest loop does not import concrete sources
- **WHEN** a developer greps `src/backend/kiosk/ingest.ts`
- **THEN** it imports the `TelemetrySource` type but not `SimulatorSource` or `FixtureSource` directly

### Requirement: Live simulator emits valid GPX-driven packets at ~1 Hz

The live simulator SHALL implement `TelemetrySource` and yield one newline-delimited JSON line approximately every 1000 ms (target 1 Hz, ±100 ms jitter acceptable). Each emitted line SHALL parse as JSON and SHALL satisfy the `TelemetryPacket` validator defined in `src/shared/telemetry/packet.ts`.

The simulator SHALL load its trajectory from a GPX file (default `src/backend/kiosk/__fixtures__/track.gpx`, override via `KIOSK_TRACK_PATH`) using Bun-native file APIs (`Bun.file(path).text()`). It SHALL extract `<trkpt lat="…" lon="…">` elements in document order and build a polyline of `{ lat, lon, cumulativeMeters }` points using haversine distance between successive points, with a total length `totalMeters`. If the GPX file is missing, unreadable, or contains fewer than two distinct `<trkpt>` points, the simulator SHALL throw at construction time with an error that names the offending path.

Per emitted tick the simulator SHALL:
1. Advance a `distanceM` counter by `cruiseSpeedMps * 1.0` seconds, where the base cruise speed is **15 km/h** (≈ 4.17 m/s). The emitted `speed` field SHALL be `15 + 1.0 * sin(elapsedSec / 4)` km/h, i.e. the base cruise speed with a slow sinusoidal jitter of amplitude 1.0 km/h.
2. Wrap `distanceM` modulo `totalMeters` so the trajectory loops continuously.
3. Linearly interpolate `lat` and `lon` between the two polyline points that bracket the wrapped `distanceM`.
4. Compute `heading` as the bearing from the previously emitted lat/lon to the current lat/lon, falling back on the bearing of the upcoming polyline segment for the very first tick after a clean start.
5. Emit `seq` as a monotonically increasing counter that wraps at 65535, `t` as `startEpochSeconds + floor(elapsedSec)`, and plausible values for `hdop`, `sats`, `bat`, `cad`, `fix`, `fix3d`, `reboot`, `rssi`, `snr`.

The simulator SHALL accept an optional `resume` argument of shape `{ kind: "simulator"; trackPath: string; distanceM: number; elapsedSec: number; seq: number }`. If the resume's `trackPath` equals the GPX path the simulator is using, the simulator SHALL initialize `distanceM`, `elapsedSec`, and `seq` from it; otherwise it SHALL start from zero. The simulator SHALL persist its current `{ kind: "simulator", trackPath, distanceM, elapsedSec, seq }` to `data/simulator-state.json` after each emitted tick using `Bun.write(...)`.

The simulator MUST stop emitting when `stop()` is called and MUST allow its `lines()` iterable to be consumed at most once.

#### Scenario: Simulator output is contract-valid
- **WHEN** the first 50 lines from the simulator are collected and each is parsed as JSON
- **THEN** every parsed object passes `validateTelemetryPacket`

#### Scenario: Sequence numbers are monotonic
- **WHEN** the first 100 lines are collected and their `seq` values are compared pairwise
- **THEN** each subsequent `seq` is greater than the previous, or wraps to 0 after 65535

#### Scenario: Emitted positions stay on the GPX polyline
- **WHEN** the first 30 emitted lines are collected and their `lat`/`lon` are projected onto the polyline of the bundled `track.gpx`
- **THEN** each projection lies within 0.5 m of the polyline (linear interpolation between adjacent `<trkpt>` points)

#### Scenario: Speed hovers around 15 km/h with small jitter
- **WHEN** the first 60 emitted lines are collected and their `speed` values examined
- **THEN** every `speed` lies within [14, 16] km/h and the mean lies within [14.8, 15.2] km/h

#### Scenario: Trajectory loops
- **WHEN** the simulator runs long enough for the cumulative emitted distance to exceed the GPX `totalMeters`
- **THEN** the next emitted lat/lon lies near the GPX start point (within 1 m) rather than continuing past the last point

#### Scenario: Missing GPX file is a clear construction-time error
- **WHEN** the simulator is constructed against a `KIOSK_TRACK_PATH` that does not exist
- **THEN** it throws synchronously (before `lines()` is consumed) with a message that includes the missing path

#### Scenario: Resume restores progress when the track path matches
- **WHEN** the simulator is constructed with `resume = { kind: "simulator", trackPath: <bundled gpx>, distanceM: 200, elapsedSec: 48, seq: 47 }` and the bundled GPX is used
- **THEN** the first emitted line has `seq === 48` and its lat/lon is the polyline point at cumulative distance ≈ 200 m + one tick of advance

#### Scenario: Resume is ignored when the track path differs
- **WHEN** the simulator is constructed with `resume.trackPath` pointing to a different file than its GPX path
- **THEN** it starts from `distanceM = 0`, `seq = 0`, and `elapsedSec = 0`

#### Scenario: Resume state is written to disk each tick
- **WHEN** the simulator has emitted three lines
- **THEN** `data/simulator-state.json` contains a JSON object with `kind: "simulator"`, the current `trackPath`, `seq === 2`, and `distanceM` reflecting three ticks of advance

#### Scenario: stop() halts emission
- **WHEN** a consumer calls `stop()` while iterating
- **THEN** the iterable resolves and no further lines are yielded

### Requirement: Static NDJSON fixture is available for tests and supports resume

The repository SHALL include a static fixture at `src/backend/kiosk/__fixtures__/sample-session.ndjson` containing at least 20 lines of valid JSON-contract packets, one per line.

A `FixtureSource` SHALL implement `TelemetrySource` by reading the file at the path passed to its constructor via `Bun.file(path).text()` and yielding the non-empty lines through `lines()`, in file order. The fixture path resolution is the consumer's responsibility; the source itself accepts a path string.

`FixtureSource` SHALL accept an optional `resume` argument of shape `{ kind: "fixture"; path: string; lineIndex: number; seq: number }`. If the resume's `path` equals the path the fixture is reading AND the file has at least `lineIndex + 1` non-empty lines, the fixture SHALL skip the first `lineIndex` non-empty lines and begin yielding from line index `lineIndex` onward. Otherwise it SHALL start from the first non-empty line. After yielding each line, `FixtureSource` SHALL persist `{ kind: "fixture", path, lineIndex, seq }` to `data/simulator-state.json` using `Bun.write(...)`, where `lineIndex` is the zero-based index of the line just yielded and `seq` is parsed from that line if present (otherwise the previous value).

Tests MUST be able to use `FixtureSource` instead of the live simulator to exercise the ingest path deterministically.

#### Scenario: Fixture file exists and is valid
- **WHEN** the file at `src/backend/kiosk/__fixtures__/sample-session.ndjson` is read and each non-empty line parsed
- **THEN** there are at least 20 lines and every parsed object passes `validateTelemetryPacket`

#### Scenario: FixtureSource yields the file's lines
- **WHEN** a test constructs `FixtureSource` against the bundled fixture with no resume and consumes all of `lines()`
- **THEN** the yielded line count matches the file's non-empty line count and the order matches the file order

#### Scenario: Resume restores position when the path matches
- **WHEN** a test constructs `FixtureSource` against the bundled fixture with `resume = { kind: "fixture", path: <bundled>, lineIndex: 5, seq: 5 }` and consumes all of `lines()`
- **THEN** the first yielded line is the file's 6th non-empty line (index 5) and the total yielded count is `total - 5`

#### Scenario: Resume is ignored when the path differs
- **WHEN** a test constructs `FixtureSource` against path A with `resume.path` set to path B
- **THEN** iteration starts from the first non-empty line of A

#### Scenario: Resume is ignored when the file is shorter than the recorded index
- **WHEN** a test constructs `FixtureSource` against a 10-line file with `resume.lineIndex = 99`
- **THEN** iteration starts from the first non-empty line

#### Scenario: FixtureSource writes resume state per yielded line
- **WHEN** a fixture yields three lines
- **THEN** `data/simulator-state.json` contains a JSON object with `kind: "fixture"`, the fixture `path`, and `lineIndex === 2`

### Requirement: Ingest loop validates and persists each packet transactionally

The kiosk runtime SHALL provide an ingest loop at `src/backend/kiosk/ingest.ts` with the following contract:

```
runIngest({ source, db, onSample? }): Promise<void>
```

For each line yielded by `source.lines()`, the loop SHALL:
1. Attempt to parse the line as JSON. On parse failure, log the error (with the offending line truncated for safety) and continue with the next line.
2. Validate the parsed object using `validateTelemetryPacket`. On validation failure, log the field error and continue.
3. In a single Drizzle transaction, insert one row into `raw_packets` (with `seq`, `received_at = Date.now()`, and the original `payload` string) and one row into `decoded_samples` (with `raw_packet_id` set to the inserted raw row's id and the validated field values).
4. If `onSample` is provided, invoke it synchronously with the decoded sample. Errors thrown by `onSample` MUST be caught and logged; they MUST NOT crash the loop or roll back the just-committed transaction.

The loop SHALL terminate cleanly when the source's `lines()` iterable completes (e.g., fixture exhausted, or simulator stopped).

#### Scenario: Valid packet writes both rows in one transaction
- **WHEN** a single valid packet flows through `runIngest`
- **THEN** exactly one row exists in `raw_packets` and exactly one row exists in `decoded_samples` referencing it, and the row contents match the input

#### Scenario: Malformed JSON does not crash the loop
- **WHEN** a fixture contains `{not json`, followed by three valid packets
- **THEN** the malformed line is logged, no rows are written for it, and three rows are written in each table for the valid packets

#### Scenario: Validation failure does not crash the loop
- **WHEN** a fixture line parses as JSON but fails `validateTelemetryPacket` (e.g., `speed` missing), followed by a valid packet
- **THEN** the invalid line is logged, no rows are written for it, and one row is written in each table for the valid packet

#### Scenario: onSample is invoked once per persisted packet
- **WHEN** a test passes an `onSample` spy and feeds three valid packets and one invalid line through the loop
- **THEN** the spy is invoked exactly three times with the decoded sample objects in order

#### Scenario: onSample errors are swallowed
- **WHEN** an `onSample` handler throws
- **THEN** the loop logs the error and continues processing subsequent lines, and the just-written rows remain in the DB

### Requirement: Kiosk boot wires DB, source, and ingest in order

When `APP_MODE=kiosk`, the backend entrypoint at `src/backend/index.ts` SHALL invoke a `bootKiosk` function (defined in `src/backend/kiosk/boot.ts`) BEFORE calling `Bun.serve()`. `bootKiosk` SHALL perform these steps in order:

1. Resolve and create (if missing) the parent directory of `KIOSK_DB_PATH`.
2. Open the Drizzle client against `KIOSK_DB_PATH`. The schema is assumed to have been applied previously via `bun run db:push`; `bootKiosk` MUST NOT invoke `drizzle-kit` or run any DDL.
3. Attempt to load resume state from `data/simulator-state.json` using `Bun.file(path).json()` wrapped in a try/catch. If the file is missing, empty, or fails to parse, resume state is treated as `undefined` and a single info line is logged.
4. Resolve the `TelemetrySource` from `KIOSK_TELEMETRY_SOURCE` (default `"simulated"` if unset), passing the loaded resume state via the resolver's options argument.
5. Start `runIngest({ source, db })` (without awaiting completion; the loop runs for the life of the process).
6. Return; control returns to the entrypoint, which then starts `Bun.serve()`.

When `APP_MODE` is unset, empty, or any value other than `"kiosk"`, `bootKiosk` MUST NOT run; the existing HTTP behavior MUST remain unchanged. The existing routes (`/*`, `/api/hello`, `/api/hello/:name`) MUST continue to be served identically in all modes.

#### Scenario: Kiosk mode boots end-to-end with the simulator
- **WHEN** the process starts with `APP_MODE=kiosk` and `KIOSK_TELEMETRY_SOURCE=simulated` against a DB whose schema has been pushed
- **THEN** the ingest loop begins writing rows and the HTTP server starts serving `/api/hello`

#### Scenario: Non-kiosk modes are unaffected
- **WHEN** the process starts with `APP_MODE` unset
- **THEN** no `data/` directory is created, no ingest loop starts, and the existing HTTP routes serve as before

#### Scenario: Boot does not push schema
- **WHEN** the process starts with `APP_MODE=kiosk`
- **THEN** no `drizzle-kit` subprocess is spawned by `boot.ts` (the operator is responsible for having run `bun run db:push` beforehand)

#### Scenario: Boot tolerates a missing resume-state file
- **WHEN** the process starts with `APP_MODE=kiosk` and no `data/simulator-state.json` exists
- **THEN** `bootKiosk` completes without throwing, an info line is logged, and the simulator starts from zero

#### Scenario: Boot tolerates a malformed resume-state file
- **WHEN** the process starts with `APP_MODE=kiosk` and `data/simulator-state.json` contains invalid JSON
- **THEN** `bootKiosk` completes without throwing, the malformed file is ignored, and the simulator starts from zero
