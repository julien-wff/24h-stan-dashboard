## ADDED Requirements

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

The kiosk schema SHALL define exactly two tables in `src/backend/kiosk/db/schema.ts`:

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

No additional tables (e.g. `race_stats`, `forwarding_queue`) are created by this change. The schema MUST be importable by both the runtime client factory and `drizzle-kit` without side effects (no top-level DB opens, no env reads at module load).

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

### Requirement: Schema is pushed to the database at kiosk startup

When `APP_MODE=kiosk`, the boot path SHALL run `drizzle-kit push` against the configured `KIOSK_DB_PATH` BEFORE opening the long-lived Drizzle client and BEFORE starting any HTTP server or ingest loop.

The push SHALL be invoked programmatically (e.g. `bunx drizzle-kit push --config drizzle.config.ts`) and SHALL be non-interactive. A non-zero exit from the push command MUST abort kiosk boot with the same non-zero exit code; the HTTP server MUST NOT start in that case.

A repository-level `drizzle.config.ts` SHALL exist that points `drizzle-kit` at `src/backend/kiosk/db/schema.ts` and reads `KIOSK_DB_PATH` from the environment (with the same default as the runtime).

The same `drizzle-kit push` invocation SHALL be exposed as a `package.json` script (`db:push`) so developers can run it manually against a custom `KIOSK_DB_PATH` without booting the server.

#### Scenario: Fresh checkout boots cleanly
- **WHEN** a developer with no existing `data/kiosk.db` runs the kiosk for the first time with `APP_MODE=kiosk KIOSK_TELEMETRY_SOURCE=simulated`
- **THEN** the push creates the `raw_packets` and `decoded_samples` tables before the ingest loop begins inserting rows

#### Scenario: Push failure aborts boot
- **WHEN** `drizzle-kit push` exits non-zero (e.g. config file missing)
- **THEN** the kiosk process exits non-zero and `Bun.serve()` is not called

#### Scenario: Re-boot against an existing DB is a no-op
- **WHEN** the kiosk boots a second time against an unchanged schema and existing DB file
- **THEN** the push completes without errors and without dropping or recreating tables; pre-existing rows remain

#### Scenario: Manual `bun run db:push` matches the boot invocation
- **WHEN** a developer runs `bun run db:push` with `KIOSK_DB_PATH=/tmp/x.db`
- **THEN** `/tmp/x.db` ends up with the same schema the kiosk boot path would produce
