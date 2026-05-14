## Why

The backend is currently a stub: it serves a "Hello, world!" page and has no telemetry pipeline. Before the dashboard, alerts, or server-forwarding can be built, the kiosk needs a place to put data and a source of data to put there. The README's kiosk runtime is supposed to read newline-delimited JSON over USB serial, persist raw + decoded telemetry to a local SQLite DB on the Raspberry Pi, and survive 4G outages — none of that exists yet. This change introduces the persistence layer and the simulated input that feeds it, so every downstream surface (WebSocket push to the kiosk dashboard, forwarding to the server runtime, alert evaluation) has a real, queryable source of truth to read from.

Doing it now also pins down two boring-but-load-bearing choices — the ORM (Drizzle on `bun:sqlite`) and the schema-push-on-startup mechanism — once, before three half-finished alternatives accumulate.

## What Changes

- **Add Drizzle ORM with the `bun:sqlite` driver** as the only way the backend talks to SQLite. Raw SQL queries from application code are prohibited; everything goes through Drizzle's query builder or its prepared-statement API. Adds `drizzle-orm` and `drizzle-kit` (dev) to `package.json`.
- **Define the kiosk database schema** in `src/backend/kiosk/db/schema.ts` with two tables:
  - `raw_packets` — verbatim JSON payloads received from the telemetry source, plus `seq`, `received_at`, and an autoincrement id. For forensics and replay; never mutated after insert.
  - `decoded_samples` — one row per validated packet, with the JSON-contract fields broken out as typed columns (`seq`, `t`, `lat`, `lon`, `speed`, `heading`, `hdop`, `sats`, `bat`, `cad`, `fix`, `fix3d`, `reboot`, `rssi`, `snr`) plus an FK to `raw_packets.id`. Nullable columns (`bat`, `cad`) are nullable in the schema.
- **Database file location is configurable** via a new env var `KIOSK_DB_PATH` (documented in `.env.example`), defaulting to `./data/kiosk.db`. The backend creates the parent directory at startup if missing.
- **Schema is applied manually** via `bun run db:push`, which shells out to `drizzle-kit push --config drizzle.config.ts` against the configured `KIOSK_DB_PATH`. `drizzle.config.ts` is added at the repo root pointing `drizzle-kit` at `src/backend/kiosk/db/schema.ts`. The kiosk runtime does NOT push the schema on startup; it assumes the operator has already applied it. If the tables are missing, the ingest loop will fail loudly on its first insert, which is the desired feedback.
- **Add a simulated telemetry source** with two flavors that share one interface:
  - A **live simulator** that emits valid JSON-contract packets at ~1 Hz with monotonically-increasing `seq`/`t` and plausible lat/lon/speed/heading values around the Place de la Carrière loop. Used at runtime when `KIOSK_TELEMETRY_SOURCE=simulated`.
  - A **static NDJSON fixture** under `src/backend/kiosk/__fixtures__/` containing a short recorded session, for deterministic unit/integration tests.
- **Add an ingest loop** in `src/backend/kiosk/ingest.ts` that consumes from the configured telemetry source, validates each packet against a Zod schema (`telemetryPacketSchema` in `src/shared/telemetry/packet.ts`), and writes one `raw_packets` row + one `decoded_samples` row per valid packet inside a single transaction. Invalid packets are logged and counted but do not crash the loop.
- **Wire the kiosk boot path** into `src/backend/index.ts`: when `APP_MODE=kiosk`, the entrypoint opens the Drizzle connection, starts the ingest loop against the configured source, and only then starts `Bun.serve()`. Existing `/*` and `/api/hello*` routes are preserved unchanged. When `APP_MODE` is unset or `server`, none of the kiosk-mode wiring runs.
- **Add unit/integration tests** under `src/backend/kiosk/` covering: schema validity (push against an in-memory or temp-file DB and assert table shape), simulator output validity (a sampled batch parses against the contract), and the ingest path (fixture in → expected rows out).
- **Reserve hook points for the next two changes** without implementing them: the ingest module exposes an `onSample` callback surface so a future "push to frontend over WebSocket" change and a future "forward to server runtime" change can subscribe without rewriting the loop. No subscribers are wired in this change.
- **Add `data/` to `.gitignore`** so local SQLite files don't get committed.

Out of scope (deferred):
- Real USB-serial reading via the receiver ESP32 path (`KIOSK_TELEMETRY_SOURCE=/dev/ttyUSB0`). Only the `simulated` value is wired in this change; the serial branch errors with a clear "not yet implemented" message.
- WebSocket push of telemetry to the frontend dashboard.
- Forwarding of telemetry/events from kiosk to the `server` runtime.
- `RaceStats` computation (lap detection, sector splits, heatmap, etc.) and the `race_stats` snapshot table.
- The forwarding-queue table and delivery-status tracking.
- Server-mode persistence (the central SQLite copy on the remote machine).
- Alert evaluation and push notifications.

## Capabilities

### New Capabilities

- `kiosk-telemetry-ingest`: how the kiosk runtime obtains telemetry samples (live simulator or static fixture, with a contract that the future serial source will satisfy), how each sample is validated, and how raw and decoded forms are written to the kiosk SQLite database. Defines the `onSample` extension surface that downstream changes (WS push, server forwarding) plug into without modifying the ingest loop.
- `kiosk-persistence`: the Drizzle-on-`bun:sqlite` ORM contract, the `raw_packets` and `decoded_samples` table shapes, the `KIOSK_DB_PATH` configuration, and the manual `bun run db:push` step that the operator runs against the configured `KIOSK_DB_PATH` to apply the schema. Establishes the rule that all kiosk DB access is through Drizzle, not raw SQL.

### Modified Capabilities

- `project-structure`: `.env.example` gains a third documented variable, `KIOSK_DB_PATH`, naming the SQLite file location for kiosk mode. The reserved `src/backend/kiosk/` subdirectory (currently a `.gitkeep` placeholder per the existing spec) is now populated with real modules — the spec requirement that the directory exists is satisfied by the new content rather than the placeholder.

## Impact

- **Files added**:
  - `src/backend/kiosk/db/schema.ts` — Drizzle table definitions.
  - `src/backend/kiosk/db/client.ts` — Drizzle/`bun:sqlite` client factory.
  - `src/backend/kiosk/db/push.ts` — programmatic wrapper around `drizzle-kit push` for use by tests and ad-hoc tooling (NOT called at kiosk boot).
  - `src/backend/kiosk/telemetry/source.ts` — `TelemetrySource` interface + resolver from `KIOSK_TELEMETRY_SOURCE`.
  - `src/backend/kiosk/telemetry/simulator.ts` — live simulator implementation.
  - `src/backend/kiosk/telemetry/fixture.ts` — NDJSON-fixture replay source for tests.
  - `src/backend/kiosk/__fixtures__/sample-session.ndjson` — short recorded fixture.
  - `src/backend/kiosk/ingest.ts` — validation + transactional write loop, with `onSample` hook.
  - `src/backend/kiosk/boot.ts` — orchestrates push → client → source → loop for `APP_MODE=kiosk`.
  - `src/shared/telemetry/packet.ts` — typed `TelemetryPacket` shape + validator shared between simulator, ingest, and (eventually) the WS layer.
  - Tests: `src/backend/kiosk/ingest.test.ts`, `src/backend/kiosk/telemetry/simulator.test.ts`, `src/backend/kiosk/db/schema.test.ts`.
  - `drizzle.config.ts` at repo root.
- **Files modified**:
  - `src/backend/index.ts` — branch on `APP_MODE` and call `boot.ts` when `kiosk`.
  - `package.json` — add `drizzle-orm` (runtime) and `drizzle-kit` (dev) dependencies; add a `db:push` convenience script that mirrors what the boot path calls.
  - `.env.example` — document `KIOSK_DB_PATH` alongside the existing `APP_MODE` and `KIOSK_TELEMETRY_SOURCE`.
  - `.gitignore` — add `data/`.
- **Dependencies added**: `drizzle-orm`, `zod` (runtime); `drizzle-kit`, `@libsql/client` (dev — `@libsql/client` is drizzle-kit's required peer driver for SQLite push).
- **Runtime behavior change**:
  - With `APP_MODE` unset (today's default), no new behavior — the server still serves the same React shell.
  - With `APP_MODE=kiosk` and `KIOSK_TELEMETRY_SOURCE=simulated`, the backend opens `./data/kiosk.db` (assumed to have been initialized via `bun run db:push`), starts streaming simulated packets at ~1 Hz, and writes two rows per packet. The HTTP layer still serves the existing routes.
- **Future changes unblocked**: WebSocket push of decoded samples to the kiosk dashboard; `RaceStats` computation against `decoded_samples`; forwarding to the `server` runtime; replacing the simulator with real USB-serial reading.
