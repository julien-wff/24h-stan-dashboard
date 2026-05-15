## ADDED Requirements

### Requirement: Default layout defines the v1 dashboard grid and slot map

A `defaultLayout: Layout` SHALL be exported from `src/frontend/kiosk/widgets/layouts/default.ts`. It SHALL satisfy the structural invariants of the `kiosk-widget-runtime` capability (`validateLayout(defaultLayout)` MUST succeed) and SHALL encode the reference design's structure:

- `topbar: "topbar"`
- `grid.columns: "440px 1fr 440px"` (left fixed, centre flexes, right fixed)
- `grid.gap: 16`
- `grid.padding: 16`
- `grid.areas`: a sequence of rows whose tokens place widgets in three columns so that
  - the **left column** contains, top-to-bottom, `speed`, `velocity`, `stats`,
  - the **centre column** contains `map` taking the upper portion and `lap-progress` as a single row at the bottom,
  - the **right column** contains, top-to-bottom, `sector`, `lap-times`, `weather`, `latest-events`.
- `grid.rows`: row sizes chosen such that the centre `map` and the right-column `lap-times` are the flex rows (i.e. expressed with `1fr`), and the other rows are `auto` or fixed.
- `slots`: exactly ten entries — `topbar` is NOT among them (it is `layout.topbar`), and the slot map keys are `speed`, `velocity`, `stats`, `map`, `lap-progress`, `sector`, `lap-times`, `weather`, `latest-events`. Wait — that is nine. The grid description above defines nine areas total under the topbar; `slots` SHALL have exactly those nine keys, each mapping to the widget id of the same name (i.e. `slots["speed"] === "speed"`, …).

The default layout SHALL be the layout passed to `<WidgetHost>` by `KioskPage`.

#### Scenario: Default layout passes validation
- **WHEN** `validateLayout(defaultLayout)` is called
- **THEN** it returns without throwing

#### Scenario: Default layout has the expected slot keys
- **WHEN** `Object.keys(defaultLayout.slots).sort()` is read
- **THEN** it equals `["lap-progress", "lap-times", "latest-events", "map", "sector", "speed", "stats", "velocity", "weather"]`

#### Scenario: Default layout slots reference widgets of the same name
- **WHEN** `defaultLayout.slots[k]` is read for any key `k`
- **THEN** the value equals `k` (each slot is filled by the widget whose id matches the slot name)

#### Scenario: Default layout uses the reference column template
- **WHEN** `defaultLayout.grid.columns` is read
- **THEN** it equals `"440px 1fr 440px"`

### Requirement: Topbar widget renders brand, elapsed timer, and lap

A widget with `id: "topbar"` SHALL be registered in the widget registry. Its component SHALL render a single horizontal bar (filling its cell, `h-full w-full`) split into three regions:

- **Left region** (yellow background, dark text): a 1:1 brand square containing the letters `CE`, beside the text `CESI · ÉCOLE D'INGÉNIEURS` (display font, bold) and a smaller subtitle `CAR #42 · TEAM NANCY`.
- **Centre region** (dark background): the label `24H DE STAN · LIVE` (dimmed), the elapsed time read from `useRaceState().elapsed` and formatted as `H:MM:SS` in `font-mono tabular-nums` at a large size, and the label `· ELAPSED ·` in the brand yellow.
- **Right region** (dark background): a sensor health summary (battery percentage, satellite count, signal bars) followed by the lap number from `useRaceState().laps` (or the highest key in `laps`, zero-padded to 3 digits) in `font-mono tabular-nums` and the brand yellow color.

The elapsed time SHALL display `0:00:00` when `state.elapsed` is `null`. The lap number SHALL display `000` when `laps` is empty.

Sensor health data MAY be sourced from fields not yet present in `RaceState` (e.g. `battery`, `signal`, `satellites`); when those fields are absent, the topbar SHALL render a `—` placeholder for each missing value rather than crashing.

#### Scenario: Topbar shows the formatted elapsed time
- **WHEN** `useRaceState()` returns a state with `elapsed: 3725`
- **THEN** the topbar's centre region renders the text `1:02:05`

#### Scenario: Topbar shows the highest lap number padded to three digits
- **WHEN** `useRaceState()` returns a state with `laps: { 1: …, 2: …, 7: … }`
- **THEN** the topbar's right region renders the text `007`

#### Scenario: Topbar uses design-system tokens
- **WHEN** the topbar widget is rendered
- **THEN** its right-region lap numeral uses Tailwind classes including `text-yellow`, `font-mono`, and `tabular-nums`, and contains no raw hex literal

### Requirement: Speed widget renders current speed with mini history and TOP/AVG sub-line

A widget with `id: "speed"` SHALL be registered. Its component SHALL render, inside the standard panel chrome titled `SPEED`:

- The current speed as a large yellow numeral (`text-yellow`, `font-mono`, `tabular-nums`) using `text-[clamp(72px,9vw,138px)]`, with the integer value of `useRaceState().speed` rounded to zero decimals, followed by a smaller `km/h` unit label in `text-text-dim`.
- Below the numeral, a row showing `TOP <topSpeed>` and `AVG <avgSpeed>` in `font-mono`, dimmed text. When the corresponding state field is `null` or absent in `RaceState`, the value SHALL be rendered as `—`.

The widget SHALL render `—` for the current speed when `state.speed` is `null`.

The widget SHALL NOT crash when fields it would consume for an optional bar history (`speedHistory`) are missing from `RaceState`; in that case, no bar history is rendered. Implementing the bar history is out of scope for this change.

#### Scenario: Speed numeral shows the rounded current speed in yellow
- **WHEN** `useRaceState()` returns `{ speed: 28.4, … }`
- **THEN** the speed widget renders the numeral `28` in an element with classes including `text-yellow`, `font-mono`, `tabular-nums`

#### Scenario: Speed numeral falls back to em-dash when speed is null
- **WHEN** `useRaceState()` returns `{ speed: null, … }`
- **THEN** the speed widget renders `—` in place of the numeric value

#### Scenario: Speed widget panel header reads "SPEED"
- **WHEN** the speed widget is rendered
- **THEN** the rendered output contains the text `SPEED` in the panel header position

### Requirement: Stats widget renders a key/value list of derived race totals

A widget with `id: "stats"` SHALL be registered. Its component SHALL render, inside the standard panel chrome titled `STATS`, a vertical list of five labelled rows in this order:

1. `DISTANCE` — `distanceKm` rounded to one decimal, suffix ` km`
2. `AVG SPEED` — `avgSpeed` rounded to one decimal, suffix ` km/h`
3. `TOP SPEED` — `topSpeed` rounded to one decimal, suffix ` km/h`, value coloured `text-green`
4. `CALORIES` — `calories` integer, suffix ` kcal`, value coloured `text-amber`, with a smaller `2 PEDALERS` sub-label under the row label
5. `PIT STOPS` — `<pitStops> · <pitDuration formatted as M:SS>`

Each row's value SHALL render `—` when the source field is absent or `null` in `RaceState`. Numbers SHALL use `font-mono tabular-nums`. Rows SHALL be separated by `border-border` borders.

The stats widget is allowed to consume fields not currently in `RaceState` (`distanceKm`, `avgSpeed`, `topSpeed`, `calories`, `pitStops`, `pitDuration`); when absent, the row renders `—` for the value. Extending `RaceState` to populate these fields is out of scope for this change.

#### Scenario: Stats widget renders all five rows in order
- **WHEN** the stats widget is rendered against any `RaceState`
- **THEN** the rendered output contains the labels `DISTANCE`, `AVG SPEED`, `TOP SPEED`, `CALORIES`, `PIT STOPS` in that vertical order

#### Scenario: Top speed value is coloured green
- **WHEN** the stats widget renders a `RaceState` where `topSpeed === 32.7`
- **THEN** the rendered output contains the text `32.7 km/h` in an element with the Tailwind class `text-green`

#### Scenario: Missing fields render as em-dash
- **WHEN** the stats widget renders a `RaceState` where none of `distanceKm`, `avgSpeed`, `topSpeed`, `calories`, `pitStops`, `pitDuration` are present
- **THEN** every row's value cell renders `—`

### Requirement: Sector widget renders four sector rows with active indicator

A widget with `id: "sector"` SHALL be registered. Its component SHALL render, inside the standard panel chrome titled `SECTORS`, exactly four rows in order, one per sector index `0..3`. The sector names SHALL be, in order: `S1 · NORTH STRAIGHT`, `S2 · EAST TURN`, `S3 · SOUTH STRAIGHT`, `S4 · WEST TURN`.

Each row SHALL display:

- A small square indicator at the row's left edge: `bg-yellow` when `state.sector === i`, `bg-text-dimmer` (or equivalent dim grey) otherwise.
- The sector name, coloured `text-text` when active, `text-text-dim` otherwise.
- The sector's `last` time formatted as `M:SS.ss` in `font-mono tabular-nums`. The value SHALL be coloured `text-purple` when this row's `last` equals this row's `best` (i.e. the latest lap's sector time is also the all-time best for that sector, within 0.05 s). It SHALL be `text-text` otherwise. When `last` is `null`, the value SHALL render `—:——`.

The widget SHALL read `state.sector` and `state.sectors` from `useRaceState()`. No additional fields are required.

#### Scenario: Sector widget renders four rows with the documented names
- **WHEN** the sector widget is rendered against any `RaceState`
- **THEN** the rendered output contains, in order, the strings `S1 · NORTH STRAIGHT`, `S2 · EAST TURN`, `S3 · SOUTH STRAIGHT`, `S4 · WEST TURN`

#### Scenario: Active sector row is highlighted
- **WHEN** the sector widget is rendered against a state with `sector: 2`
- **THEN** the third row's indicator element has the Tailwind class `bg-yellow` and the sector name's text class is `text-text` (not `text-text-dim`)

#### Scenario: Best sector time is rendered in purple
- **WHEN** the sector widget is rendered against a state where `sectors[0]` is `{ last: 22.34, best: 22.34 }`
- **THEN** that row's time value has the Tailwind class `text-purple`

#### Scenario: Missing sector time renders as em-dash placeholder
- **WHEN** the sector widget renders a row whose `last` is `null`
- **THEN** the row's time cell renders the text `—:——`

### Requirement: Lap-progress widget renders a single horizontal progress bar

A widget with `id: "lap-progress"` SHALL be registered. Its component SHALL render — without the standard panel chrome, but inside a single horizontal `bg-panel border border-border` strip filling its cell — a single row containing in order:

1. The label `LAP PROGRESS` in `text-text-dim` with letter-spaced display font.
2. A horizontal bar (`bg-[#1f1f1a]` or an equivalent dark Tailwind class — this is the one bespoke colour acceptable here since it is part of the design's UI furniture, not the palette tokens; alternatively expressed via `bg-ground` if visually identical) whose filled portion is a child element with `bg-yellow` and `width: <state.s * 100>%`. Three vertical tick marks SHALL be overlaid on the bar at the sector boundary positions (computed from a project-known constant, the same one the map widget uses).
3. The progress percentage `(state.s * 100).toFixed(1)%` in `font-mono tabular-nums`, `text-text`.
4. The current lap time `state.currentLapTime` formatted as `M:SS.ss` in `font-mono tabular-nums`, `text-yellow`.

The widget SHALL render the fill at width `0%` when `state.s` is `null`, and SHALL render the current lap time as `—:——` when `state.currentLapTime` is `null`.

Setting the fill bar's `width` via inline `style` is allowed (it is a dynamic, data-derived value not expressible as a Tailwind class).

#### Scenario: Progress fill width tracks state.s
- **WHEN** the lap-progress widget is rendered against `{ s: 0.473, … }`
- **THEN** the fill element has computed `width` equal to `47.3%` of its container

#### Scenario: Progress label and time use the documented Tailwind classes
- **WHEN** the lap-progress widget is rendered against any non-null `s` and `currentLapTime`
- **THEN** the percentage element has classes including `font-mono tabular-nums text-text`, and the lap-time element has classes including `font-mono tabular-nums text-yellow`

#### Scenario: Lap-progress falls back gracefully on null state
- **WHEN** the lap-progress widget is rendered against `{ s: null, currentLapTime: null, … }`
- **THEN** the fill element has computed `width: 0%` and the lap-time element renders `—:——`

### Requirement: Lap-times widget renders best/last summary and recent laps

A widget with `id: "lap-times"` SHALL be registered. Its component SHALL render, inside the standard panel chrome titled `LAP TIMES` (with a right-aligned header chip showing `L<N>` where N is the highest lap number, coloured `text-yellow`), two regions stacked vertically:

1. **Summary region** — a 2-column grid:
   - Left column header `BEST LAP`, value = `state.bestLap.timeSec` formatted as `M:SS.ss` in `text-purple`, `font-mono tabular-nums`, with sub-label `LAP <N>` where N is the lap number of `state.bestLap`. When `state.bestLap` is `null`, value renders `—:——` and sub-label is omitted.
   - Right column header `LAST LAP`, value = the last lap's `timeSec` (highest lap number in `state.laps`) formatted as `M:SS.ss` in `text-yellow`, `font-mono tabular-nums`, with sub-label `Δ <delta>` where delta is the signed seconds difference between the last lap and the best lap (`+0.42`, `-0.13`, …). When there is no last lap, value renders `—:——` and sub-label is omitted.
2. **List region** — the contents of `state.recentLaps` rendered in reverse chronological order, up to 8 rows. Each row is a 3-column grid with:
   - Left: lap number `L<n>` in `text-text-dim`, `font-mono`.
   - Middle: lap time `M:SS.ss` in `font-mono tabular-nums`, coloured `text-purple` when the lap time equals `state.bestLap.timeSec` (within 0.05 s), `text-text` otherwise.
   - Right: either the literal text `BEST` in `text-purple` for the best lap, or `+<delta>` (delta = `lap.timeSec - bestLap.timeSec`, rounded to 2 decimals) in `text-text-dim` (or `text-green` when the delta is within 5% of the best).

Rows in the list region SHALL be separated by a subtle `border-t border-border` (omitted from the first row).

#### Scenario: Best lap row is highlighted in purple
- **WHEN** the lap-times widget is rendered against a state with `bestLap: { lap: 12, timeSec: 88.34, … }` and `recentLaps` including that lap
- **THEN** the row whose label is `L12` renders the lap-time element with the Tailwind class `text-purple` and the right-aligned cell renders `BEST` (also `text-purple`)

#### Scenario: Last lap value uses yellow
- **WHEN** the lap-times widget renders against a state where the highest-numbered lap has `timeSec: 91.5`
- **THEN** the summary right column's value element renders `1:31.50` with Tailwind class `text-yellow`

#### Scenario: Empty state renders placeholders
- **WHEN** the lap-times widget renders against a state with `bestLap: null` and `laps: {}`
- **THEN** both summary values render `—:——` and the list region renders zero rows

### Requirement: Placeholder widgets occupy the remaining slots

Four widgets SHALL be registered, each produced by the `placeholder(id, title)` factory from `kiosk-widget-runtime`:

- `placeholder("velocity",       "VELOCITY · 240s")`
- `placeholder("map",            "PLACE DE LA CARRIÈRE · NANCY")`
- `placeholder("weather",        "WEATHER · NANCY")`
- `placeholder("latest-events",  "LATEST EVENTS")`

These widgets SHALL render the standard panel chrome with the given title and an empty body region. They SHALL NOT call `useRaceState()`.

#### Scenario: Map placeholder renders its title and no content
- **WHEN** the `map` widget is rendered
- **THEN** the rendered output contains the text `PLACE DE LA CARRIÈRE · NANCY` in the panel header, and its body region contains no text content

#### Scenario: Placeholder widgets do not subscribe to race state
- **WHEN** the source files for the four placeholder widget registrations are read
- **THEN** none of them import `useRaceState` from `@frontend/kiosk/state/store`

### Requirement: All v1 widgets read race state only via `useRaceState()`

Every real widget (`topbar`, `speed`, `stats`, `sector`, `lap-progress`, `lap-times`) SHALL access race state exclusively through the `useRaceState()` hook from `@frontend/kiosk/state/store`. Widgets SHALL NOT:

- Import the store internals (`getSnapshot`, `subscribe`, `dispatch`, `setConnection`, `resetState`, the mutable `state` binding) directly.
- Import or open a WebSocket, fetch, or any other I/O primitive.
- Read from `RaceUpdate` types or any backend type.

#### Scenario: No widget imports store internals
- **WHEN** a developer greps `src/frontend/kiosk/widgets/` for `from "@frontend/kiosk/state/store"`
- **THEN** every match imports only the symbol `useRaceState` (and possibly the `RaceState` type), and no widget imports `getSnapshot`, `subscribe`, `dispatch`, `setConnection`, or `resetState`

#### Scenario: No widget performs I/O
- **WHEN** a developer greps `src/frontend/kiosk/widgets/` for `WebSocket`, `fetch(`, or any `ws-client` import
- **THEN** no matches are found
