## MODIFIED Requirements

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

No in-memory state snapshot table (e.g. `race_state_snapshots`) is created — derived view-state is the client's responsibility. The schema MUST be importable by both the runtime client factory and `drizzle-kit` without side effects (no top-level DB opens, no env reads at module load).

#### Scenario: Schema exports both tables
- **WHEN** another module imports `rawPackets` and `decodedSamples` from `src/backend/kiosk/db/schema.ts`
- **THEN** both are Drizzle table objects whose columns match this requirement

#### Scenario: Nullable fields are nullable in the type
- **WHEN** TypeScript infers the row type of `decoded_samples`
- **THEN** `bat` and `cad` are typed `number | null`; all other columns match their non-null types

#### Scenario: Indexes exist after push
- **WHEN** the schema is pushed to a fresh DB and the developer queries `sqlite_master`
- **THEN** indexes on `decoded_samples(seq)` and `decoded_samples(t)` are present

## ADDED Requirements

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
