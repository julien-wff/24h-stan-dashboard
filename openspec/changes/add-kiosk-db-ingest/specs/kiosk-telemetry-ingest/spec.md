## ADDED Requirements

### Requirement: Telemetry sources implement a uniform interface

The kiosk runtime SHALL define a `TelemetrySource` interface in `src/backend/kiosk/telemetry/source.ts` with at minimum:
- `lines(): AsyncIterable<string>` — yields newline-delimited JSON payloads as strings, exactly as received (no parsing, no validation).
- `stop(): Promise<void>` — idempotently stops the source and resolves once the iterable is fully drained.

A resolver function `resolveTelemetrySource(value: string): TelemetrySource` SHALL map the value of `KIOSK_TELEMETRY_SOURCE` to an implementation:
- `"simulated"` → the live simulator implementation.
- A value starting with `/dev/` or `tty` → throws an error stating that the serial source is not yet implemented.
- Any other value → throws an error naming the unknown value.

The ingest loop MUST consume only the `TelemetrySource` interface; it MUST NOT know which implementation it is talking to.

#### Scenario: Resolver returns the simulator for `simulated`
- **WHEN** `resolveTelemetrySource("simulated")` is called
- **THEN** it returns an object implementing `lines()` and `stop()` backed by the live simulator

#### Scenario: Resolver rejects the serial path with a clear message
- **WHEN** `resolveTelemetrySource("/dev/ttyUSB0")` is called
- **THEN** it throws an error whose message states that the serial telemetry source is not yet implemented

#### Scenario: Resolver rejects unknown values
- **WHEN** `resolveTelemetrySource("nonsense")` is called
- **THEN** it throws an error whose message includes the unrecognized value

#### Scenario: Ingest loop does not import concrete sources
- **WHEN** a developer greps `src/backend/kiosk/ingest.ts`
- **THEN** it imports the `TelemetrySource` type but not `SimulatorSource` or `FixtureSource` directly

### Requirement: Live simulator emits valid JSON-contract packets at ~1 Hz

The live simulator SHALL implement `TelemetrySource` and yield one newline-delimited JSON line approximately every 1000 ms (target 1 Hz, ±100 ms jitter acceptable). Each emitted line SHALL parse as JSON and SHALL satisfy the `TelemetryPacket` validator defined in `src/shared/telemetry/packet.ts`.

The simulator SHALL produce:
- A monotonically increasing `seq` that wraps at 65535.
- A `t` value that advances with wall time (process-start epoch + elapsed seconds).
- `lat`/`lon` values consistent with a closed-loop trajectory near Place de la Carrière (no real map-matching required; a parametric ellipse is acceptable).
- A `speed` in the range [0, 60] km/h.
- A `heading` in the range [0, 360).
- Plausible values for `hdop`, `sats`, `bat`, `cad`, `fix`, `fix3d`, `reboot`, `rssi`, `snr`.

The simulator MUST stop emitting when `stop()` is called and MUST allow its `lines()` iterable to be consumed at most once.

#### Scenario: Simulator output is contract-valid
- **WHEN** the first 50 lines from the simulator are collected and each is parsed as JSON
- **THEN** every parsed object passes `validateTelemetryPacket`

#### Scenario: Sequence numbers are monotonic
- **WHEN** the first 100 lines are collected and their `seq` values are compared pairwise
- **THEN** each subsequent `seq` is greater than the previous, or wraps to 0 after 65535

#### Scenario: stop() halts emission
- **WHEN** a consumer calls `stop()` while iterating
- **THEN** the iterable resolves and no further lines are yielded

### Requirement: Static NDJSON fixture is available for tests

The repository SHALL include a static fixture at `src/backend/kiosk/__fixtures__/sample-session.ndjson` containing at least 20 lines of valid JSON-contract packets, one per line.

A `FixtureSource` SHALL implement `TelemetrySource` by reading this file (or any file path passed to its constructor) via `Bun.file(...).text()` and yielding the lines through `lines()`. The fixture path resolution is the consumer's responsibility; the source itself takes an absolute path.

Tests MUST be able to use `FixtureSource` instead of the live simulator to exercise the ingest path deterministically.

#### Scenario: Fixture file exists and is valid
- **WHEN** the file at `src/backend/kiosk/__fixtures__/sample-session.ndjson` is read and each non-empty line parsed
- **THEN** there are at least 20 lines and every parsed object passes `validateTelemetryPacket`

#### Scenario: FixtureSource yields the file's lines
- **WHEN** a test constructs `FixtureSource` against the bundled fixture and consumes all of `lines()`
- **THEN** the yielded line count matches the file's non-empty line count and the order matches the file order

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
3. Resolve the `TelemetrySource` from `KIOSK_TELEMETRY_SOURCE` (default `"simulated"` if unset).
4. Start `runIngest({ source, db })` (without awaiting completion; the loop runs for the life of the process).
5. Return; control returns to the entrypoint, which then starts `Bun.serve()`.

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
