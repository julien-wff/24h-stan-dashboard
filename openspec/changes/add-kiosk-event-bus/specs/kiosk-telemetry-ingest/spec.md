## MODIFIED Requirements

### Requirement: Kiosk boot wires DB, source, and ingest in order

When `APP_MODE=kiosk`, the backend entrypoint at `src/backend/index.ts` SHALL invoke a `bootKiosk` function (defined in `src/backend/kiosk/boot.ts`) BEFORE calling `Bun.serve()`. `bootKiosk` SHALL perform these steps in order:

1. Resolve and create (if missing) the parent directory of `KIOSK_DB_PATH`.
2. Open the Drizzle client against `KIOSK_DB_PATH`. The schema is assumed to have been applied previously via `bun run db:push`; `bootKiosk` MUST NOT invoke `drizzle-kit` or run any DDL.
3. Attempt to load resume state from `data/simulator-state.json` using `Bun.file(path).json()` wrapped in a try/catch. If the file is missing, empty, or fails to parse, resume state is treated as `undefined` and a single info line is logged.
4. Resolve the `TelemetrySource` from `KIOSK_TELEMETRY_SOURCE` (default `"simulated"` if unset), passing the loaded resume state via the resolver's options argument.
5. Load the track centerline from `KIOSK_TRACK_PATH` (default `src/backend/kiosk/__fixtures__/track.gpx`) via the `kiosk-event-bus` capability's `loadCenterline` helper. If the file is missing or invalid, boot SHALL fail fast with an error whose message includes the resolved absolute path.
6. Construct the `TypedEventBus<RaceEventMap>` and the lap detector. The lap detector is created against `{ db, centerline, bus }`. At construction time, the detector SHALL query the open DB once for `SELECT MAX(lap) FROM laps` so its in-memory lap counter resumes after the last persisted lap.
7. Start `runIngest({ source, db, onSample: lapDetector.handleSample })` (without awaiting completion; the loop runs for the life of the process).
8. Return; control returns to the entrypoint, which then starts `Bun.serve()`.

When `APP_MODE` is unset, empty, or any value other than `"kiosk"`, `bootKiosk` MUST NOT run; the existing HTTP behavior MUST remain unchanged. The existing routes (`/*`, `/api/hello`, `/api/hello/:name`) MUST continue to be served identically in all modes.

#### Scenario: Kiosk mode boots end-to-end with the simulator
- **WHEN** the process starts with `APP_MODE=kiosk` and `KIOSK_TELEMETRY_SOURCE=simulated` against a DB whose schema has been pushed
- **THEN** the ingest loop begins writing rows, the lap detector is wired as the `onSample` handler, and the HTTP server starts serving `/api/hello`

#### Scenario: Non-kiosk modes are unaffected
- **WHEN** the process starts with `APP_MODE` unset
- **THEN** no `data/` directory is created, no ingest loop starts, no centerline is loaded, and the existing HTTP routes serve as before

#### Scenario: Boot does not push schema
- **WHEN** the process starts with `APP_MODE=kiosk`
- **THEN** no `drizzle-kit` subprocess is spawned by `boot.ts` (the operator is responsible for having run `bun run db:push` beforehand)

#### Scenario: Boot tolerates a missing resume-state file
- **WHEN** the process starts with `APP_MODE=kiosk` and no `data/simulator-state.json` exists
- **THEN** `bootKiosk` completes without throwing, an info line is logged, and the simulator starts from zero

#### Scenario: Boot tolerates a malformed resume-state file
- **WHEN** the process starts with `APP_MODE=kiosk` and `data/simulator-state.json` contains invalid JSON
- **THEN** `bootKiosk` completes without throwing, the malformed file is ignored, and the simulator starts from zero

#### Scenario: Boot fails fast on missing or invalid GPX
- **WHEN** the process starts with `APP_MODE=kiosk` and `KIOSK_TRACK_PATH` points to a missing or unparseable GPX file
- **THEN** `bootKiosk` exits non-zero with an error message containing the resolved absolute path; no ingest loop is started; `Bun.serve()` is not called

#### Scenario: Lap counter resumes after the last persisted lap
- **WHEN** the kiosk boots against a DB whose `laps` table already contains rows up to `lap = 7`
- **THEN** the next `lap` event emitted carries `lap === 8` (not `1`)
