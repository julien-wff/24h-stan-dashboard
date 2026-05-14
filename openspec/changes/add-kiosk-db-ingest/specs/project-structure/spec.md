## MODIFIED Requirements

### Requirement: Documented runtime mode contract via `.env.example`

The repository SHALL provide a `.env.example` file at the repository root that documents every environment variable the runtime will consume in future changes.

At minimum, `.env.example` SHALL define and comment:
- `APP_MODE` — accepted values `kiosk` and `server`, with a one-line description of each.
- `KIOSK_TELEMETRY_SOURCE` — accepted forms (a serial device path such as `/dev/ttyUSB0`, or the literal string `simulated`).
- `KIOSK_DB_PATH` — filesystem path to the kiosk SQLite database, with a one-line description naming the default `./data/kiosk.db`.

The file SHALL NOT be a working `.env` (no real credentials). The actual `.env` file SHALL remain gitignored.

The runtime SHALL read `KIOSK_DB_PATH` at kiosk boot (per the `kiosk-persistence` capability). `APP_MODE` and `KIOSK_TELEMETRY_SOURCE` continue to be documented here; their full runtime behavior is owned by the kiosk capabilities and is out of scope for this requirement.

#### Scenario: `.env.example` exists and is committed
- **WHEN** the repository is cloned
- **THEN** `.env.example` is present at the repository root and is tracked by git

#### Scenario: `.env.example` names the required variables
- **WHEN** a developer reads `.env.example`
- **THEN** it contains lines defining `APP_MODE`, `KIOSK_TELEMETRY_SOURCE`, and `KIOSK_DB_PATH` with accompanying comments naming their accepted values or default

#### Scenario: `.env` is not committed
- **WHEN** a developer creates a local `.env` from the example
- **THEN** `.gitignore` prevents `.env` from being staged
