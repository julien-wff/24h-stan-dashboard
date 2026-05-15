## 1. Schema

- [ ] 1.1 Add the `laps` table definition to `src/backend/kiosk/db/schema.ts` (columns per the persistence delta spec; `lap` as PRIMARY KEY, application-supplied, **not** autoincrement; no `is_best_*` columns).
- [ ] 1.2 Extend `src/backend/kiosk/db/schema.test.ts` to assert the `laps` table is created with the right columns, PK on `lap`, and no `is_best*` columns after push.
- [ ] 1.3 Run `bun run db:push` against the local `data/kiosk.db` to apply the new schema; verify with `sqlite3 data/kiosk.db '.schema laps'`.

## 2. Track centerline helper

- [ ] 2.1 Create `src/backend/kiosk/track/centerline.ts` exporting `loadCenterline(path: string): Centerline`, the `Centerline` type, the `SECTOR_BOUNDARIES_S = [0, 0.25, 0.5, 0.75]` constant, and a `project(lat, lon): { sM, s, sector }` method on the returned object. Pure module — no env reads, no DB, no top-level I/O.
- [ ] 2.2 Write `src/backend/kiosk/track/centerline.test.ts` covering: happy-path load against the bundled GPX, missing file throws synchronously with the absolute path in the message, a file with fewer than two `<trkpt>` points throws, `project()` of the first track point returns `s ≈ 0` and `sector === 0`, `project()` returns the correct sector at the four interior boundary positions.
- [ ] 2.3 Refactor `src/backend/kiosk/telemetry/simulator.ts` to consume the shared `loadCenterline` helper instead of its inline GPX parsing. Re-run `bun test src/backend/kiosk/telemetry/simulator.test.ts` to confirm no regression.

## 3. Typed event bus

- [ ] 3.1 Create `src/backend/kiosk/events/types.ts` exporting `LapEvent` (payload shape per spec) and `RaceEventMap = { lap: LapEvent }`. Confirm `RaceEventMap` has no `error` key.
- [ ] 3.2 Create `src/backend/kiosk/events/bus.ts` exporting `TypedEventBus<M extends Record<string, unknown>>` as a subclass of `node:events` `EventEmitter`. Override `on`, `once`, `off`, `emit` with the narrowed `<K extends keyof M & string>` signatures from the spec. Override `emit` so each listener is invoked inside its own `try/catch` and thrown errors are logged via `console.error` without propagating.
- [ ] 3.3 Write `src/backend/kiosk/events/bus.test.ts` covering: `TypedEventBus.prototype instanceof EventEmitter`, `once`/`removeAllListeners` inherited and functional, listener exception does not abort fan-out to remaining listeners and does not throw out of `emit`, payload type-check via a TS expect-error fixture for an intentionally wrong emit call.

## 4. Lap detector

- [ ] 4.1 Create `src/backend/kiosk/events/lap.ts` exporting `createLapDetector({ db, centerline, bus }): { handleSample(sample: DecodedSample): void }`.
- [ ] 4.2 Implement the projection + unwrapped-distance state machine: drop samples where `fix === 0`, project lat/lon via `centerline.project(...)`, maintain `unwrappedDistanceM` with the wrap rule (`delta < -totalMeters/2 → delta += totalMeters`), detect boundary when `floor(unwrappedDistanceM / totalMeters)` increments. Enforce the `MIN_LAP_DISTANCE_M = totalMeters * 0.9` anti-jitter threshold between successive boundaries.
- [ ] 4.3 Implement sector-split accumulation: per sample `dt = sample.t - lastT` is added to `splits[currentSector]`; on boundary, capture the four-tuple and reset accumulators.
- [ ] 4.4 Implement first-lap warmup: the first detected boundary starts lap 1 silently (resets splits, records `startedAt`); lap 1 is emitted at the second boundary.
- [ ] 4.5 Implement persistence ordering: insert via `db.insert(laps).values({ lap, started_at, ended_at, time_sec, sector1_sec, ..., sector4_sec })`, then emit `bus.emit('lap', event)`. On insert failure, log and continue; advance the in-memory lap counter so the next emitted lap is still `counter + 1`. Do not use raw SQL — Drizzle only.
- [ ] 4.6 On detector construction, query `SELECT MAX(lap) FROM laps` (via Drizzle's `max()` helper) once and initialize the in-memory lap counter to that value (or `0` if no rows exist).
- [ ] 4.7 Write `src/backend/kiosk/events/lap.test.ts` driving deterministic synthetic samples through the detector. Cover: warmup discards first partial lap, normal laps emit with `splits.reduce(+) === timeSec` within 1e-6, GPS jitter < 0.9 × totalMeters near the line does not fire, `fix === 0` samples are ignored, insert-error path (mocked failing `db.insert`) suppresses the event but advances the counter, construction against a DB with `lap = 7` already persisted resumes from `lap = 8`.

## 5. Boot wiring

- [ ] 5.1 Update `src/backend/kiosk/boot.ts` to insert two new steps between source resolution and ingest start: (a) `loadCenterline(KIOSK_TRACK_PATH ?? defaultGpxPath)`, (b) construct the `TypedEventBus<RaceEventMap>` and `createLapDetector({ db, centerline, bus })`. Pass `onSample: lapDetector.handleSample` into the existing `runIngest({ source, db, ... })` call.
- [ ] 5.2 Ensure boot fails fast with a clear error including the resolved absolute GPX path when `loadCenterline` throws (just propagate — `loadCenterline` already builds the message). Verify `Bun.serve()` is not reached in that path.
- [ ] 5.3 Extend `src/backend/kiosk/boot.test.ts` covering: end-to-end fixture run through `bootKiosk` produces `laps` rows and emitted `lap` events, missing/invalid GPX causes `bootKiosk` to throw before `runIngest` starts, lap counter resumes from `MAX(lap) + 1` against a pre-populated `laps` table.

## 6. Verification

- [ ] 6.1 Run `bun test` — all tests pass (full suite, not just newly-added files).
- [ ] 6.2 Run `bun run check` — Biome formatter, linter, and import-sort all report clean. Do not suppress with `biome-ignore`; fix root causes.
- [ ] 6.3 Run `bun run openspec validate add-kiosk-event-bus --strict` to confirm the change is still valid after implementation.
