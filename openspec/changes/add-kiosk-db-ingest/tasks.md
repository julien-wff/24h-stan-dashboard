## 1. Dependencies & config

- [ ] 1.1 Add `drizzle-orm` to `dependencies` and `drizzle-kit` to `devDependencies` via `bun add` / `bun add -d`; commit updated `package.json` and `bun.lock`
- [ ] 1.2 Add a `db:push` script to `package.json` (`bunx drizzle-kit push --config drizzle.config.ts`)
- [ ] 1.3 Add `KIOSK_DB_PATH` to `.env.example` with a comment naming the default `./data/kiosk.db`
- [ ] 1.4 Add `data/` to `.gitignore`
- [ ] 1.5 Create `drizzle.config.ts` at the repo root: dialect `sqlite`, driver `bun-sqlite`, schema path `./src/backend/kiosk/db/schema.ts`, reading `KIOSK_DB_PATH` (default `./data/kiosk.db`) for the DB URL

## 2. Shared telemetry contract

- [ ] 2.1 Create `src/shared/telemetry/packet.ts` exporting a `TelemetryPacket` type matching the JSON contract (14 fields, `bat` and `cad` nullable)
- [ ] 2.2 In the same file, export `validateTelemetryPacket(value: unknown): { ok: true; packet: TelemetryPacket } | { ok: false; error: string }` — hand-rolled, no runtime-validator dep
- [ ] 2.3 Re-export the type from `src/shared/index.ts` so frontends can import it later
- [ ] 2.4 Write `src/shared/telemetry/packet.test.ts` covering: valid packet accepted, missing required field rejected with the field name in the error, wrong-type field rejected, nullable fields accept `null`

## 3. Drizzle schema & client

- [ ] 3.1 Create `src/backend/kiosk/db/schema.ts` with `rawPackets` and `decodedSamples` tables matching the spec's column list and types
- [ ] 3.2 Declare indexes on `decodedSamples.seq` and `decodedSamples.t` in the schema file
- [ ] 3.3 Create `src/backend/kiosk/db/client.ts` exporting `createKioskDb(path: string)` that opens a `bun:sqlite` `Database` and returns a Drizzle client typed against the schema
- [ ] 3.4 Write `src/backend/kiosk/db/schema.test.ts` that pushes the schema (via `drizzle-kit push` invoked from the test, or by introspecting the Drizzle client) against a temp-file DB and asserts both tables and both indexes exist

## 4. Startup schema push

- [ ] 4.1 Create `src/backend/kiosk/db/push.ts` exporting `pushSchema(dbPath: string): Promise<void>` that resolves `KIOSK_DB_PATH` into the environment and spawns `bunx drizzle-kit push --config drizzle.config.ts` non-interactively (use `Bun.spawn` with stdio `inherit`)
- [ ] 4.2 On non-zero exit, throw an error with the captured stderr and the exit code; on success, resolve
- [ ] 4.3 Verify (and document with a comment if needed) the `drizzle-kit` flag(s) required to suppress its interactive prompts; if no such flag exists, document a fallback in the design's "Open Questions" follow-up

## 5. Telemetry source interface & implementations

- [ ] 5.1 Create `src/backend/kiosk/telemetry/source.ts` exporting the `TelemetrySource` interface (`lines()`, `stop()`) and the `resolveTelemetrySource(value: string)` function with the three branches (`simulated`, serial-path → not-implemented error, unknown → error)
- [ ] 5.2 Create `src/backend/kiosk/telemetry/simulator.ts` exporting `SimulatorSource implements TelemetrySource` — ~1 Hz parametric loop around Place de la Carrière, monotonic `seq` with 65535 wrap, contract-valid JSON per emission, clean `stop()`
- [ ] 5.3 Create `src/backend/kiosk/telemetry/fixture.ts` exporting `FixtureSource implements TelemetrySource` that takes an absolute file path and yields its lines via `Bun.file(path).text()` split on `\n`, skipping empty lines
- [ ] 5.4 Create `src/backend/kiosk/__fixtures__/sample-session.ndjson` with at least 20 hand-authored contract-valid packets (monotonic `seq`/`t`, plausible lat/lon around Place de la Carrière)
- [ ] 5.5 Write `src/backend/kiosk/telemetry/simulator.test.ts`: collect the first 50 lines, parse each, every parsed packet passes `validateTelemetryPacket`, `seq` is monotonic (with wrap allowed), `stop()` halts emission
- [ ] 5.6 Write `src/backend/kiosk/telemetry/fixture.test.ts`: every fixture line is contract-valid; `FixtureSource` yields lines in file order with matching count
- [ ] 5.7 Write a small resolver test asserting `simulated` returns a `SimulatorSource`, `/dev/ttyUSB0` throws "not yet implemented", and an unknown value throws naming the value

## 6. Ingest loop

- [ ] 6.1 Create `src/backend/kiosk/ingest.ts` exporting `runIngest({ source, db, onSample? }): Promise<void>` and a `DecodedSample` type derived from the Drizzle row type of `decoded_samples`
- [ ] 6.2 For each line: JSON.parse with try/catch, log + continue on parse failure (truncate the offending line in the log)
- [ ] 6.3 Validate with `validateTelemetryPacket`; log + continue on validation failure
- [ ] 6.4 In one Drizzle transaction, insert into `raw_packets` (with `received_at = Date.now()` and the original payload string), capture the inserted id, insert into `decoded_samples` with `raw_packet_id` set; commit
- [ ] 6.5 After commit, call `onSample` (if provided) inside try/catch; log handler errors and continue
- [ ] 6.6 Terminate cleanly when `source.lines()` completes
- [ ] 6.7 Write `src/backend/kiosk/ingest.test.ts` covering: one valid packet writes one row in each table with the right linkage; malformed JSON line does not crash and writes nothing; valid-JSON-but-invalid-shape does not crash and writes nothing; `onSample` is invoked exactly once per persisted packet; throwing `onSample` does not crash the loop; row counts after a multi-packet fixture match the input

## 7. Kiosk boot orchestration

- [ ] 7.1 Create `src/backend/kiosk/boot.ts` exporting `bootKiosk(): Promise<{ db: DrizzleDb; stopIngest: () => Promise<void> }>` that: resolves `KIOSK_DB_PATH` (default `./data/kiosk.db`), `mkdir -p` its parent, calls `pushSchema`, opens the Drizzle client, resolves the telemetry source, spawns `runIngest` (not awaited), returns the client + a stop handle
- [ ] 7.2 On any step's failure, propagate by throwing — let the entrypoint exit non-zero

## 8. Entrypoint wiring

- [ ] 8.1 In `src/backend/index.ts`, branch on `process.env.APP_MODE`: when `"kiosk"`, `await bootKiosk()` before `serve(...)`; otherwise behave exactly as today
- [ ] 8.2 Verify (manually with a smoke command) that `APP_MODE` unset still serves the React shell and `/api/hello` identically — no `data/` created, no DB opened
- [ ] 8.3 Verify (manually) that `APP_MODE=kiosk KIOSK_TELEMETRY_SOURCE=simulated bun run dev` produces `./data/kiosk.db`, populates rows in both tables, and serves the existing HTTP routes

## 9. Quality gates

- [ ] 9.1 Run `bun test` and fix any failures (no `biome-ignore` comments, no skipped tests)
- [ ] 9.2 Run `bun run check` and fix any formatter/linter/import-sort issues
- [ ] 9.3 Run `bun run lint` for a final clean report
- [ ] 9.4 Run `bun run build` to confirm the bundler still produces a `dist/` (no regression from the entrypoint changes)
