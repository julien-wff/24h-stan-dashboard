## ADDED Requirements

### Requirement: `tick` event is emitted once per decoded sample

The kiosk event bus SHALL emit a `tick` domain event for each decoded telemetry sample that passes the GPS-fix gate (`fix !== 0`). The emission MUST be wired by a `createTickEmitter({ bus, centerline })` factory in `src/backend/kiosk/events/tick.ts`, composed alongside the existing lap detector via `runIngest`'s `onSample` hook (both detectors receive each decoded sample independently).

The `tick` event payload SHALL be a `TickEvent` shape with the following fields, all derived purely from the sample and the loaded centerline:

| Field | Type | Source |
|---|---|---|
| `t` | `number` | `sample.t` (unix seconds) |
| `elapsed` | `number` | `sample.t - getRaceStartUnixSec()` (seconds; may be negative pre-race) |
| `lat` | `number` | `sample.lat` |
| `lon` | `number` | `sample.lon` |
| `heading` | `number` | `sample.heading` (0–360°) |
| `speed` | `number` | `sample.speed` (km/h) |
| `s` | `number` | `centerline.project(sample.lat, sample.lon).sM / centerline.totalMeters` (in `[0, 1)`) |
| `sector` | `0 \| 1 \| 2 \| 3` | `centerline.project(sample.lat, sample.lon).sector` |

The tick emitter MUST NOT write to any database table, MUST NOT touch lap-detector state, and MUST NOT alter the lap detector's observable behavior. The `RaceEventMap` type in `src/backend/kiosk/events/types.ts` SHALL include `tick: TickEvent` alongside the existing `lap: LapEvent` entry.

#### Scenario: Tick is emitted per fixed sample
- **WHEN** a decoded sample with `fix === 1` flows through `runIngest`
- **THEN** exactly one `tick` event is emitted whose `t`, `lat`, `lon`, `heading`, `speed` mirror the sample's fields and whose `s`/`sector` equal `centerline.project(sample.lat, sample.lon)`'s outputs

#### Scenario: Unfixed samples produce no tick
- **WHEN** a decoded sample with `fix === 0` flows through `runIngest`
- **THEN** no `tick` event is emitted (matching the lap detector's gating)

#### Scenario: Elapsed reflects race start
- **WHEN** `RACE_START_AT=2026-05-23T16:00:00+02:00` is set and a sample with `t = 1748008800` (= 2026-05-23T15:00:00+02:00, one hour pre-race) flows through
- **THEN** the emitted `tick` event has `elapsed === -3600`

#### Scenario: Tick and lap may both fire on the same sample
- **WHEN** a sample triggers a lap completion (its arc-length wraps past the start/finish boundary)
- **THEN** both a `tick` event (per the per-sample emission rule) and a `lap` event (per the existing lap-detector rules) are emitted; both listeners receive their respective payloads, and ordering between them is unspecified

#### Scenario: Tick emitter does not mutate the database
- **WHEN** 100 decoded samples flow through the tick emitter
- **THEN** the row counts of `raw_packets`, `decoded_samples`, and `laps` are unchanged by the emitter itself (any changes are attributable to ingest and the lap detector, not to the tick emitter)

### Requirement: Race-start timestamp is configurable via `RACE_START_AT`

The repository SHALL expose a helper `getRaceStartUnixSec(): number` from `src/shared/race.ts`. The helper SHALL read the environment variable `RACE_START_AT` and return the unix-seconds value of the parsed instant.

- When `RACE_START_AT` is unset, empty, or whitespace-only, `getRaceStartUnixSec()` SHALL return the unix-seconds value of `2026-05-23T16:00:00+02:00` (16:00 CEST on race day, equal to `1748008800`).
- When `RACE_START_AT` is set to a value parseable by `new Date(...)` as a valid timestamp with explicit timezone offset, `getRaceStartUnixSec()` SHALL return the unix-seconds value of that instant.
- When `RACE_START_AT` is set but cannot be parsed as a valid timestamp, `getRaceStartUnixSec()` SHALL throw an `Error` whose message includes the offending value.

`RACE_START_AT` SHALL be documented in `.env.example` with an inline comment naming the default (`2026-05-23T16:00:00+02:00`) and the expected ISO-8601-with-offset format.

#### Scenario: Default is used when env is unset
- **WHEN** `RACE_START_AT` is unset and `getRaceStartUnixSec()` is called
- **THEN** it returns `1748008800` (unix seconds of `2026-05-23T16:00:00+02:00`)

#### Scenario: Custom value is honored
- **WHEN** `RACE_START_AT=2026-06-01T10:00:00Z` is set and `getRaceStartUnixSec()` is called
- **THEN** it returns the unix-seconds value of `2026-06-01T10:00:00Z` (= `1748772000`)

#### Scenario: Malformed value throws
- **WHEN** `RACE_START_AT=not-a-date` is set and `getRaceStartUnixSec()` is called
- **THEN** it throws an `Error` whose message includes the string `"not-a-date"`

#### Scenario: `.env.example` documents the variable
- **WHEN** a developer reads `.env.example`
- **THEN** it contains an entry for `RACE_START_AT` whose comment names the default and the expected ISO-8601-with-offset format
