# kiosk-persistence Specification

## Purpose

Defines how the kiosk runtime persists telemetry data to a local SQLite database: the ORM access path (Drizzle), the schema (raw_packets + decoded_samples), the database location (configurable via `KIOSK_DB_PATH`), and the operator-driven schema-application workflow (`bun run db:push`). This capability owns all kiosk-side persistence concerns up to but not including ingest orchestration (owned by `kiosk-telemetry-ingest`).

## Requirements

### Requirement: Drizzle ORM is the only database access path

All application-level access to the kiosk SQLite database SHALL go through Drizzle ORM using the `drizzle-orm/bun-sqlite` driver against a `bun:sqlite` `Database` instance. Raw SQL strings (e.g. `db.run("INSERT ...")`, `db.query("SELECT ...").all()`) MUST NOT appear in `src/backend/**` or `src/shared/**`. The only exception is migration tooling owned by `drizzle-kit`.

A single Drizzle client factory SHALL live at `src/backend/kiosk/db/client.ts` and SHALL return a typed Drizzle instance bound to the schema in `src/backend/kiosk/db/schema.ts`. Other modules (ingest, tests, future WS push, future forwarding) MUST receive this client via dependency injection rather than calling the factory themselves.

#### Scenario: App code uses Drizzle for inserts
- **WHEN** the ingest loop receives a valid packet
- **THEN** the corresponding rows are written via Drizzle's `insert(...).values(...)` API, not via raw SQL strings

#### Scenario: No raw SQL appears in the backend tree
- **WHEN** a developer greps `src/backend/` and `src/shared/` for `bun:sqlite`'s raw query methods (`db.query`, `db.prepare`, `db.run`) outside `src/backend/kiosk/db/`
- **THEN** the only matches are inside `src/backend/kiosk/db/client.ts` (driver construction), not in feature code

#### Scenario: Client is injected, not re-created
- **WHEN** `runIngest({ db, source })` is called from `bootKiosk` and from a test
- **THEN** both call sites pass an explicit `db` instance; `runIngest` does not import or call the client factory itself

### Requirement: Kiosk database schema defines `raw_packets` and `decoded_samples`

The kiosk schema SHALL define `raw_packets` and `decoded_samples` in `src/backend/kiosk/db/schema.ts`. Additional tables required by other capabilities (such as `laps` from `kiosk-event-bus`) MAY be defined alongside them in the same module.

**`raw_packets`** — verbatim, append-only forensic log. Columns:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `seq` INTEGER NOT NULL
- `received_at` INTEGER NOT NULL (Unix milliseconds, server clock)
- `payload` TEXT NOT NULL (the exact JSON line received)

**`decoded_samples`** — typed projection of the JSON contract. Columns:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `raw_packet_id` INTEGER NOT NULL, FK → `raw_packets.id`
- `seq` INTEGER NOT NULL
- `t` INTEGER NOT NULL (Unix seconds from packet payload)
- `lat` REAL NOT NULL
- `lon` REAL NOT NULL
- `speed` REAL NOT NULL
- `heading` REAL NOT NULL
- `hdop` REAL NOT NULL
- `sats` INTEGER NOT NULL
- `bat` INTEGER NULLABLE
- `cad` INTEGER NULLABLE
- `fix` INTEGER NOT NULL (0 or 1)
- `fix3d` INTEGER NOT NULL (0 or 1)
- `reboot` INTEGER NOT NULL (0 or 1)
- `rssi` INTEGER NOT NULL
- `snr` REAL NOT NULL

The schema SHALL declare indexes on `decoded_samples(seq)` and `decoded_samples(t)`.

The schema MUST be importable by both the runtime client factory and `drizzle-kit` without side effects (no top-level DB opens, no env reads at module load).

#### Scenario: Schema exports both tables
- **WHEN** another module imports `rawPackets` and `decodedSamples` from `src/backend/kiosk/db/schema.ts`
- **THEN** both are Drizzle table objects whose columns match this requirement

#### Scenario: Nullable fields are nullable in the type
- **WHEN** TypeScript infers the row type of `decoded_samples`
- **THEN** `bat` and `cad` are typed `number | null`; all other columns match their non-null types

#### Scenario: Indexes exist after push
- **WHEN** the schema is pushed to a fresh DB and the developer queries `sqlite_master`
- **THEN** indexes on `decoded_samples(seq)` and `decoded_samples(t)` are present

### Requirement: Kiosk DB path is configurable via `KIOSK_DB_PATH`

The kiosk runtime SHALL read its SQLite database path from the environment variable `KIOSK_DB_PATH`. When unset, it SHALL default to `./data/kiosk.db` (relative to the process working directory).

Before opening the DB, the kiosk boot path SHALL ensure the parent directory exists (creating it recursively if necessary). If the parent cannot be created, boot SHALL fail with an error message that includes the resolved absolute path.

The variable SHALL be documented in `.env.example` alongside the existing `APP_MODE` and `KIOSK_TELEMETRY_SOURCE`.

#### Scenario: Default path is used when env is unset
- **WHEN** `APP_MODE=kiosk` is set, `KIOSK_DB_PATH` is unset, and the kiosk boots
- **THEN** the DB file is created at `./data/kiosk.db` and the `data/` directory is created if missing

#### Scenario: Custom path is honored
- **WHEN** `KIOSK_DB_PATH=/tmp/race-test.db` is set and the kiosk boots
- **THEN** the DB file is created at `/tmp/race-test.db` and no `./data/` directory is created

#### Scenario: Unwritable parent fails fast
- **WHEN** `KIOSK_DB_PATH` points to a path under a non-writable parent and the kiosk boots
- **THEN** boot exits non-zero with an error message containing the resolved absolute path

#### Scenario: `.env.example` documents the variable
- **WHEN** a developer reads `.env.example`
- **THEN** it contains a `KIOSK_DB_PATH` entry with a comment naming the default `./data/kiosk.db`

### Requirement: Schema is applied manually via `bun run db:push`

Schema setup SHALL be an explicit operator action, not a kiosk-startup action. The kiosk runtime MUST NOT invoke `drizzle-kit push` or any schema-applying step at boot.

A repository-level `drizzle.config.ts` SHALL exist that points `drizzle-kit` at `src/backend/kiosk/db/schema.ts` and reads `KIOSK_DB_PATH` from the environment (with the same default as the runtime).

A `db:push` script SHALL be defined in `package.json` that invokes `bunx drizzle-kit push --config drizzle.config.ts`. Running it applies the schema to the DB at `KIOSK_DB_PATH` (default `./data/kiosk.db`).

#### Scenario: `db:push` creates both tables on a fresh DB
- **WHEN** an operator runs `bun run db:push` with no existing DB file
- **THEN** `raw_packets` and `decoded_samples` (with their indexes) are created at `KIOSK_DB_PATH`

#### Scenario: Re-running `db:push` is a no-op for unchanged schema
- **WHEN** an operator runs `bun run db:push` a second time against an existing DB with the same schema
- **THEN** the command completes without errors and without dropping or recreating tables; pre-existing rows remain

#### Scenario: `db:push` honors `KIOSK_DB_PATH`
- **WHEN** an operator runs `KIOSK_DB_PATH=/tmp/x.db bun run db:push`
- **THEN** `/tmp/x.db` ends up with the schema (and `./data/kiosk.db` is not touched)

#### Scenario: Kiosk boot does not invoke schema push
- **WHEN** the process starts with `APP_MODE=kiosk`
- **THEN** `boot.ts` does NOT shell out to `drizzle-kit`; it opens the Drizzle client and starts ingest directly

### Requirement: Kiosk database schema defines `laps`

The kiosk schema SHALL also define a `laps` table in `src/backend/kiosk/db/schema.ts` to persist completed laps detected by the `kiosk-event-bus` capability.

**`laps`** — one row per completed lap. Columns:
- `lap` INTEGER PRIMARY KEY (1-based, monotonically increasing across the life of the DB; not autoincrement — the application supplies the value)
- `started_at` INTEGER NOT NULL (Unix milliseconds; first sample of this lap)
- `ended_at` INTEGER NOT NULL (Unix milliseconds; boundary sample that closed this lap)
- `time_sec` REAL NOT NULL (`(ended_at - started_at) / 1000`)
- `sector1_sec` REAL NOT NULL
- `sector2_sec` REAL NOT NULL
- `sector3_sec` REAL NOT NULL
- `sector4_sec` REAL NOT NULL

No additional indexes are required — at the scale of a 24-hour race the table grows to fewer than ~1,500 rows and full scans are cheap. The PRIMARY KEY on `lap` already supports `MAX(lap)` and `ORDER BY lap` access patterns.

The table MUST NOT carry `is_best_lap` / `is_best_sector` flag columns; best-lap and best-sector facts are derived on read (see next requirement). The schema MUST be importable by both the runtime client factory and `drizzle-kit` without side effects (no top-level DB opens, no env reads at module load).

#### Scenario: Schema exports the laps table
- **WHEN** a module imports `laps` from `src/backend/kiosk/db/schema.ts`
- **THEN** it is a Drizzle table object whose columns match this requirement, with `lap` as the primary key

#### Scenario: `db:push` creates the laps table
- **WHEN** an operator runs `bun run db:push` against a fresh DB
- **THEN** the `laps` table exists alongside `raw_packets` and `decoded_samples`

#### Scenario: No best-flag columns are present
- **WHEN** a developer queries `PRAGMA table_info(laps)` after `bun run db:push`
- **THEN** no column whose name starts with `is_best` appears

### Requirement: Best lap and best sector are derived on read

Best-lap and per-sector-best records SHALL NOT be precomputed or stored as flag columns. Consumers (the future WS broadcast layer, the dashboard's snapshot replay) SHALL compute them on read via SQL aggregation through Drizzle:

- Best lap (overall): `SELECT MIN(time_sec) FROM laps` — equivalent in Drizzle as `db.select({ best: min(laps.timeSec) }).from(laps)`.
- Best sector `i` (1..4): `SELECT MIN(sectorN_sec) FROM laps`.

This keeps the source of truth in the row data and avoids stale-flag bugs if rows are ever corrected, replayed, or backfilled.

#### Scenario: Best lap is a SQL aggregation
- **WHEN** a consumer needs the current best lap time
- **THEN** it issues `SELECT MIN(time_sec) FROM laps` (via Drizzle's `min()` helper), not a lookup against any flag column or cached value

#### Scenario: No `is_best_*` columns are queried
- **WHEN** a developer greps `src/backend/**` for `is_best`
- **THEN** there are no matches against the `laps` table (the column does not exist and no application code expects it)
