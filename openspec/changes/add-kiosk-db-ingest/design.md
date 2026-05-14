## Context

The kiosk runtime is meant to read newline-delimited JSON from a receiver ESP32 over USB serial, persist raw + decoded telemetry to a local SQLite DB on a Raspberry Pi, serve a TV dashboard, and forward upstream. Today none of that exists — the backend is the stub from the `init-project-base` change and `src/backend/kiosk/` is an empty placeholder.

This change carves off the smallest slice that produces a useful data pipeline: a persistence layer (Drizzle on `bun:sqlite`), a simulated source that emits packets matching the README's JSON contract, and an ingest loop that wires the two together. It is deliberately scoped to leave the WebSocket-push and server-forwarding work as separate follow-ups, while pinning down the foundational choices (ORM, migration strategy, telemetry-source abstraction) once.

Constraints:
- The race target is a Raspberry Pi at the stand. No network is assumed at boot. The DB push must work offline.
- Bun is the runtime; `bun:sqlite` is the only SQLite driver in scope (per `CLAUDE.md`).
- All app-level DB access must go through an ORM, not raw SQL strings.
- The simulator and the future serial reader must be interchangeable behind one interface, so the ingest loop never learns which one it is talking to.
- The ingest loop must expose a clean extension surface for the next two changes (WS push, server forwarding) without being rewritten.

## Goals / Non-Goals

**Goals:**
- Establish Drizzle ORM (with `bun:sqlite`) as the only DB access path in the codebase.
- Define the two foundational kiosk tables (`raw_packets`, `decoded_samples`) and freeze their shape for the upcoming WS and forwarding work.
- Make schema setup a startup concern: a fresh checkout running `APP_MODE=kiosk KIOSK_TELEMETRY_SOURCE=simulated bun run dev` works with zero manual DB steps.
- Ship a deterministic simulator and a static fixture so tests don't depend on timing or wall-clock state.
- Define and lock the `TelemetrySource` interface that the future serial implementation will satisfy.
- Expose an `onSample` hook on the ingest loop so the next two changes plug in without touching `ingest.ts`.

**Non-Goals:**
- Real USB-serial reading. The `/dev/tty*` branch of `KIOSK_TELEMETRY_SOURCE` is left as an explicit "not yet implemented" error.
- WebSocket push to the kiosk dashboard or any frontend rendering of decoded samples.
- Forwarding decoded samples to the `server` runtime; no `forwarding_queue` table.
- `RaceStats` computation (lap detection, sectors, heatmap) and any derived snapshot table.
- Server-mode persistence (the central SQLite copy).
- Alert evaluation and push notifications.
- Schema versioning across releases. `drizzle-kit push` is sufficient because the DB on a Pi is treated as ephemeral race-state, not a long-lived product DB.
- Cross-platform path handling beyond what `node:path` already gives us.

## Decisions

### Drizzle ORM with the `bun:sqlite` driver

Use `drizzle-orm/bun-sqlite` against a `Database` instance from `bun:sqlite`. Schema lives in `src/backend/kiosk/db/schema.ts`. The Drizzle client is created once per process by `src/backend/kiosk/db/client.ts` and injected into the ingest loop and tests.

**Why not raw SQL?** The proposal forbids it. Raw `db.run("INSERT ...")` would be shorter today but loses type-safe row types, makes the future `RaceStats` queries painful, and invites string-concatenation footguns.

**Why not Prisma / Kysely / better-sqlite3?** Prisma carries a heavy generator and a separate engine binary that complicates the Pi deploy. Kysely is fine but has no first-class Bun-SQLite adapter and no built-in push. `better-sqlite3` is explicitly disallowed by `CLAUDE.md`. Drizzle has a native `drizzle-orm/bun-sqlite` driver and pairs with `drizzle-kit push` out of the box.

### Schema: two tables, `raw_packets` and `decoded_samples`

```ts
// raw_packets — verbatim, append-only forensic log
{
  id: integer primary key autoincrement,
  seq: integer not null,                  // 0..65535 from packet
  received_at: integer not null,          // unix millis, server clock
  payload: text not null                  // exact JSON line received
}

// decoded_samples — typed projection of the JSON contract
{
  id: integer primary key autoincrement,
  raw_packet_id: integer not null references raw_packets(id),
  seq: integer not null,
  t: integer not null,                    // unix seconds from packet (GPS time)
  lat: real not null,
  lon: real not null,
  speed: real not null,
  heading: real not null,
  hdop: real not null,
  sats: integer not null,
  bat: integer,                           // nullable per JSON contract
  cad: integer,                           // nullable per JSON contract
  fix: integer not null,                  // 0/1 — sqlite has no bool
  fix3d: integer not null,                // 0/1
  reboot: integer not null,               // 0/1
  rssi: integer not null,
  snr: real not null
}
```

Indexes: `decoded_samples(seq)` and `decoded_samples(t)` for the lap-detection and time-range queries the next change will need.

**Why a separate raw table?** The README explicitly calls out "Raw serial JSON packets (for forensics/replay)" as part of the kiosk DB. Keeping the raw payload verbatim means schema drift on the receiver side (a new field) doesn't lose data — we re-parse from `raw_packets.payload` later.

**Why not store decoded fields as a JSON column?** SQLite can do it, but typed columns let Drizzle return real numbers/nulls and let us index `seq` and `t` without expression indexes.

**Why store both `seq` and `t` on `decoded_samples` rather than just FKing back to `raw_packets`?** Lap detection and the future heatmap will scan tens of thousands of rows; one less join per query, and Drizzle queries stay flat.

### Configurable DB path with `KIOSK_DB_PATH`

Default to `./data/kiosk.db` relative to the process CWD. The kiosk boot path resolves the value, ensures the parent directory exists (`mkdir -p`), and passes the absolute path to both the Drizzle client and `drizzle-kit push`.

**Why an env var, not hardcoded?** On the Pi the DB lives on a different volume than in dev. CI tests want a temp path per run. Hardcoding would force a code change for every deployment difference.

**Why not default to `:memory:`?** Silent data loss is worse than a missing directory. A file default makes "where did my packets go?" trivially answerable.

### Schema push on startup via `drizzle-kit push`

The kiosk boot path shells out to `bunx drizzle-kit push --config=drizzle.config.ts` before opening the long-lived Drizzle client. The config reads `KIOSK_DB_PATH` from the environment so the same command targets the right DB in dev, CI, and on the Pi.

If the push exits non-zero, kiosk boot aborts with that exit code; the HTTP server does not start. If it succeeds, the boot path proceeds to open the Drizzle client and start the ingest loop.

**Alternatives considered:**
- **`CREATE TABLE IF NOT EXISTS` on boot** — chosen against. Quick, but it can't detect or reconcile schema drift between the running app and an older DB file, which is exactly the kind of subtle race-day footgun we don't want.
- **Committed migration files + `migrate()`** — chosen against, for now. Migrations are the right answer once we have a deployed product DB to evolve carefully. For a single-event race DB that gets recreated freely, the ceremony has no payoff. Easy to swap in later: `drizzle-kit push` is non-destructive to existing data on additive changes, and the migration files would replace this codepath, not stack on top of it.
- **`drizzle-kit` as a runtime dep instead of dev dep** — chosen. Spawning it programmatically at startup means the Pi must have it available. We accept the slightly larger install footprint to keep boot-time schema setup trivial.

### `TelemetrySource` interface and resolver

```ts
// src/backend/kiosk/telemetry/source.ts
interface TelemetrySource {
  // Async iterable of raw JSON lines (strings, exactly as they came in)
  lines(): AsyncIterable<string>;
  // Idempotent stop; returns when the underlying source is fully drained
  stop(): Promise<void>;
}

function resolveTelemetrySource(value: string): TelemetrySource {
  if (value === "simulated") return new SimulatorSource();
  if (value.startsWith("/dev/") || value.startsWith("tty")) {
    throw new Error("Serial telemetry source is not yet implemented");
  }
  throw new Error(`Unknown KIOSK_TELEMETRY_SOURCE: ${value}`);
}
```

**Why an async iterable of strings rather than already-decoded objects?** Validation and the raw-packet write live in one place (the ingest loop). The source's job is to produce lines; it doesn't need to know what a packet means. This also matches what a serial reader will naturally produce (chunk-split-on-`\n`).

**Why one interface, two implementations?** The fixture replayer and the live simulator share enough plumbing (line emission, cancellation) that a second interface would just duplicate. The future serial implementation slots into the same shape.

### Live simulator: ~1 Hz, plausible-but-not-realistic

Emit packets every 1000 ms with:
- `seq`: monotonic, wraps at 65535
- `t`: process-start epoch + elapsed seconds
- `lat`/`lon`: parametric position on a fixed elliptical loop centered on Place de la Carrière (no real map-matching)
- `speed`: a smoothed sine wave in [15, 35] km/h
- `heading`: derived from the position derivative
- `hdop`/`sats`/`bat`/`cad`/`fix`/`fix3d`/`reboot`/`rssi`/`snr`: plausible constants with occasional jitter

It writes to `process.stdout`? No — it implements `lines()` and yields strings. Cancellation via `stop()` cleanly exits the generator.

**Why not borrow the README's 24-hour weather/race pattern?** Out of scope. We need bytes flowing into the DB, not a faithful race replay. Realism is a follow-up problem.

### Static NDJSON fixture for tests

A small recorded session (~50 lines) at `src/backend/kiosk/__fixtures__/sample-session.ndjson`. The `FixtureSource` reads it eagerly with `Bun.file(...).text()` then yields lines synchronously through the same `AsyncIterable<string>` shape.

**Why a file rather than an inline-string fixture?** Two reasons: (1) it doubles as a debugging tool — you can run the kiosk against the fixture by pointing `KIOSK_TELEMETRY_SOURCE` at it if we extend the resolver later; (2) it makes the contract concrete — when the JSON shape evolves, regenerating the fixture surfaces every breaking change at once.

### Ingest loop: validate, write transactionally, emit

```ts
// src/backend/kiosk/ingest.ts
type SampleHandler = (sample: DecodedSample) => void;

async function runIngest(opts: {
  source: TelemetrySource;
  db: DrizzleDb;
  onSample?: SampleHandler;
}): Promise<void>
```

Per line:
1. Parse JSON; on parse error, increment a `bad_data` counter, log once per N, continue.
2. Validate against the `TelemetryPacket` shape using a small hand-rolled validator in `src/shared/telemetry/packet.ts` (no Zod dep — the contract is fixed and small).
3. In one Drizzle transaction: insert into `raw_packets`, get the rowid, insert into `decoded_samples` with that FK.
4. Call `onSample(decoded)` if provided. Handler errors are caught and logged so a misbehaving subscriber can't kill the loop.

**Why a transaction per packet?** SQLite + WAL handles single-row transactions trivially at 1 Hz, and it keeps `raw_packets` ↔ `decoded_samples` consistent. If we ever batch (e.g., on the future serial path under load), we wrap a window of packets in one transaction instead — the loop shape doesn't change.

**Why no Zod / Valibot?** The packet shape is 14 typed fields. A hand-rolled validator is ~30 lines, has no dependency surface, and produces actionable error messages keyed on field names. Adding a runtime validator library is reserved for when we have more than one such schema.

### Boot path: `APP_MODE` gating in `src/backend/index.ts`

```ts
if (process.env.APP_MODE === "kiosk") {
  await bootKiosk();   // push schema → open db → start ingest
}
// HTTP server starts in all modes; routes unchanged.
```

**Why gate inside the entrypoint rather than a separate binary?** One process, one bundle, one Bun script. The README's runtime model is "one app, two modes," and forking entrypoints would split the build output.

**Why does HTTP start in all modes?** The frontend shell is still served in both modes (kiosk TV vs. remote phone), and `APP_MODE=server` work is coming. Gating only the ingest pipeline keeps this change additive.

## Risks / Trade-offs

- **`drizzle-kit push` requires `bunx`/Node available on the Pi at boot.** → Mitigation: the Pi image already has Bun (it runs the app); `drizzle-kit` ships as a dev dep but is exercised via `bunx`, which resolves from `node_modules`. Document this in the kiosk setup notes; verify in the boot path with a clear error if the binary isn't found.
- **Per-packet transactions over a 24h session produce ~86k row pairs.** → Mitigation: at 1 Hz this is well within SQLite/WAL comfort; WAL checkpointing is automatic at defaults. Revisit only if a 24h dry-run shows write amplification problems. Adding batching later is a one-function change.
- **Schema drift between a stale DB file and new code.** → Mitigation: `drizzle-kit push` runs every boot, so additive changes apply themselves. Destructive renames will prompt for confirmation, which means kiosk boot would hang — accepted, because at race time we'd nuke the DB anyway. Document a "delete `data/kiosk.db` to reset" rescue path.
- **Simulator drift from the real serial format.** → Mitigation: both the simulator and the fixture must round-trip through the same `TelemetryPacket` validator that the future serial reader will use. If the validator passes simulator output, it must pass real-serial output, and divergence shows up as test failures the day the serial reader lands.
- **`KIOSK_DB_PATH` pointing at a directory the process can't create.** → Mitigation: the boot path explicit-checks parent-dir creation and fails loudly with the resolved absolute path in the error message.
- **`onSample` handlers blocking the loop.** → Mitigation: the loop calls handlers synchronously but inside a try/catch; the convention is documented that handlers must be fast and non-throwing, and the next change (WS push) will fan out via a queue, not by blocking the producer.

## Migration Plan

No data migration — the kiosk DB does not exist yet. Deploy order:

1. Land this change. Existing `APP_MODE`-unset runs are unaffected (no new behavior).
2. On the Pi, set `APP_MODE=kiosk` and `KIOSK_TELEMETRY_SOURCE=simulated`. First boot creates `./data/kiosk.db` via push and starts ingest.
3. To reset: delete `./data/kiosk.db` and restart. Next boot recreates it.

Rollback: revert the change. The `data/` directory remains on disk but is harmless (gitignored, not referenced by older code).

## Open Questions

- **`drizzle-kit push` interactive prompts.** `drizzle-kit push` can ask for confirmation on destructive changes. For automated boot, we'll need to pass a `--force`-equivalent or wrap stdin. To be resolved during implementation by reading the `drizzle-kit` flags; if it can't be made non-interactive, fall back to writing the DDL inline as a transitional step.
- **Should the resolver accept a file path for the fixture in dev?** Probably yes (e.g., `KIOSK_TELEMETRY_SOURCE=./fixtures/foo.ndjson`), but not needed for the simulator path to work. Deferring to a follow-up unless it falls out of the implementation naturally.
