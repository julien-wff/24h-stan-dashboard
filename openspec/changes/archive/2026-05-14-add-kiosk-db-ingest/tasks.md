## 1. Dependencies & config

- [x] 1.1 Add `drizzle-orm` to `dependencies` and `drizzle-kit` to `devDependencies` via `bun add` / `bun add -d`; commit updated `package.json` and `bun.lock`
- [x] 1.2 Add a `db:push` script to `package.json` (`bunx drizzle-kit push --config drizzle.config.ts`)
- [x] 1.3 Add `KIOSK_DB_PATH` to `.env.example` with a comment naming the default `./data/kiosk.db`
- [x] 1.4 Add `data/` to `.gitignore`
- [x] 1.5 Create `drizzle.config.ts` at the repo root: dialect `sqlite`, driver `bun-sqlite`, schema path `./src/backend/kiosk/db/schema.ts`, reading `KIOSK_DB_PATH` (default `./data/kiosk.db`) for the DB URL

## 2. Shared telemetry contract

- [x] 2.1 Create `src/shared/telemetry/packet.ts` exporting a Zod schema `telemetryPacketSchema` for the JSON contract (15 fields; `bat` and `cad` are `z.number().nullable()`), with `TelemetryPacket = z.infer<typeof telemetryPacketSchema>`
- [x] 2.2 In the same file, export `validateTelemetryPacket(value: unknown): { ok: true; packet: TelemetryPacket } | { ok: false; error: string }` that calls `safeParse` and formats the first issue's `path` + `message` into the error string
- [x] 2.3 Re-export the type from `src/shared/index.ts` so frontends can import it later
- [x] 2.4 Write `src/shared/telemetry/packet.test.ts` covering: valid packet accepted, missing required field rejected with the field name in the error, wrong-type field rejected, nullable fields accept `null`

## 3. Drizzle schema & client

- [x] 3.1 Create `src/backend/kiosk/db/schema.ts` with `rawPackets` and `decodedSamples` tables matching the spec's column list and types
- [x] 3.2 Declare indexes on `decodedSamples.seq` and `decodedSamples.t` in the schema file
- [x] 3.3 Create `src/backend/kiosk/db/client.ts` exporting `createKioskDb(path: string)` that opens a `bun:sqlite` `Database` and returns a Drizzle client typed against the schema
- [x] 3.4 Write `src/backend/kiosk/db/schema.test.ts` that pushes the schema (via `drizzle-kit push` invoked from the test, or by introspecting the Drizzle client) against a temp-file DB and asserts both tables and both indexes exist

## 4. Schema push helper (manual / test-only)

- [x] 4.1 Create `src/backend/kiosk/db/push.ts` exporting `pushSchema(dbPath: string): Promise<void>` that spawns `bunx drizzle-kit push --config drizzle.config.ts` with `KIOSK_DB_PATH=<dbPath>` in the child environment. This helper is for tests and ad-hoc tooling; it MUST NOT be imported by `boot.ts`.
- [x] 4.2 On non-zero exit, throw an error with the captured stderr and the exit code; on success, resolve
- [x] 4.3 Document the manual workflow: operators run `bun run db:push` once (and again after schema changes) before booting the kiosk

## 5. Telemetry source interface & implementations

- [x] 5.1 Create `src/backend/kiosk/telemetry/source.ts` exporting the `TelemetrySource` interface (`lines()`, `stop()`) and the `resolveTelemetrySource(value: string)` function with the three branches (`simulated`, serial-path → not-implemented error, unknown → error)
- [x] 5.2 Create `src/backend/kiosk/telemetry/simulator.ts` exporting `SimulatorSource implements TelemetrySource` — ~1 Hz parametric loop around Place de la Carrière, monotonic `seq` with 65535 wrap, contract-valid JSON per emission, clean `stop()`
- [x] 5.3 Create `src/backend/kiosk/telemetry/fixture.ts` exporting `FixtureSource implements TelemetrySource` that takes an absolute file path and yields its lines via `Bun.file(path).text()` split on `\n`, skipping empty lines
- [x] 5.4 Create `src/backend/kiosk/__fixtures__/sample-session.ndjson` with at least 20 hand-authored contract-valid packets (monotonic `seq`/`t`, plausible lat/lon around Place de la Carrière)
- [x] 5.5 Write `src/backend/kiosk/telemetry/simulator.test.ts`: collect the first 50 lines, parse each, every parsed packet passes `validateTelemetryPacket`, `seq` is monotonic (with wrap allowed), `stop()` halts emission
- [x] 5.6 Write `src/backend/kiosk/telemetry/fixture.test.ts`: every fixture line is contract-valid; `FixtureSource` yields lines in file order with matching count
- [x] 5.7 Write a small resolver test asserting `simulated` returns a `SimulatorSource`, `/dev/ttyUSB0` throws "not yet implemented", and an unknown value throws naming the value

## 6. Ingest loop

- [x] 6.1 Create `src/backend/kiosk/ingest.ts` exporting `runIngest({ source, db, onSample? }): Promise<void>` and a `DecodedSample` type derived from the Drizzle row type of `decoded_samples`
- [x] 6.2 For each line: JSON.parse with try/catch, log + continue on parse failure (truncate the offending line in the log)
- [x] 6.3 Validate with `validateTelemetryPacket`; log + continue on validation failure
- [x] 6.4 In one Drizzle transaction, insert into `raw_packets` (with `received_at = Date.now()` and the original payload string), capture the inserted id, insert into `decoded_samples` with `raw_packet_id` set; commit
- [x] 6.5 After commit, call `onSample` (if provided) inside try/catch; log handler errors and continue
- [x] 6.6 Terminate cleanly when `source.lines()` completes
- [x] 6.7 Write `src/backend/kiosk/ingest.test.ts` covering: one valid packet writes one row in each table with the right linkage; malformed JSON line does not crash and writes nothing; valid-JSON-but-invalid-shape does not crash and writes nothing; `onSample` is invoked exactly once per persisted packet; throwing `onSample` does not crash the loop; row counts after a multi-packet fixture match the input

## 7. Kiosk boot orchestration

- [x] 7.1 Create `src/backend/kiosk/boot.ts` exporting `bootKiosk(): Promise<{ db: DrizzleDb; stopIngest: () => Promise<void> }>` that: resolves `KIOSK_DB_PATH` (default `./data/kiosk.db`), `mkdir -p` its parent, opens the Drizzle client, resolves the telemetry source, spawns `runIngest` (not awaited), returns the client + a stop handle. Does NOT push schema — that is a manual `bun run db:push` step.
- [x] 7.2 On any step's failure, propagate by throwing — let the entrypoint exit non-zero

## 8. Entrypoint wiring

- [x] 8.1 In `src/backend/index.ts`, branch on `process.env.APP_MODE`: when `"kiosk"`, `await bootKiosk()` before `serve(...)`; otherwise behave exactly as today
- [x] 8.2 Verify (manually with a smoke command) that `APP_MODE` unset still serves the React shell and `/api/hello` identically — no `data/` created, no DB opened
- [x] 8.3 Verify (manually) that, after `bun run db:push`, `APP_MODE=kiosk KIOSK_TELEMETRY_SOURCE=simulated bun run dev` populates rows in both tables of `./data/kiosk.db` and serves the existing HTTP routes

## 9. Quality gates

- [x] 9.1 Run `bun test` and fix any failures (no `biome-ignore` comments, no skipped tests)
- [x] 9.2 Run `bun run check` and fix any formatter/linter/import-sort issues
- [x] 9.3 Run `bun run lint` for a final clean report
- [x] 9.4 Run `bun run build` to confirm the bundler still produces a `dist/` (no regression from the entrypoint changes)
