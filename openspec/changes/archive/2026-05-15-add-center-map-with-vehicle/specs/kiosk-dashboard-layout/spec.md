## MODIFIED Requirements

### Requirement: Placeholder widgets occupy the remaining slots

Three widgets SHALL be registered, each produced by the `placeholder(id, title)` factory from `kiosk-widget-runtime`:

- `placeholder("velocity",       "VELOCITY · 240s")`
- `placeholder("weather",        "WEATHER · NANCY")`
- `placeholder("latest-events",  "LATEST EVENTS")`

These widgets SHALL render the standard panel chrome with the given title and an empty body region. They SHALL NOT call `useRaceState()`.

The `map` slot is NOT a placeholder; it is filled by the real `MapWidget` defined by the `kiosk-map-widget` capability.

#### Scenario: Placeholder widgets do not subscribe to race state
- **WHEN** the source files for the three placeholder widget registrations are read
- **THEN** none of them import `useRaceState` from `@frontend/kiosk/state/store`

#### Scenario: Map slot is filled by the real map widget, not a placeholder
- **WHEN** the widget registry is queried for the widget with id `"map"`
- **THEN** the returned entry is the `MapWidget` from `kiosk-map-widget`, and its component is not produced by the `placeholder()` factory

### Requirement: All v1 widgets read race state only via `useRaceState()`

Every real widget (`topbar`, `speed`, `stats`, `sector`, `lap-progress`, `lap-times`, `map`) SHALL access race state exclusively through the `useRaceState()` hook from `@frontend/kiosk/state/store`. Widgets SHALL NOT:

- Import the store internals (`getSnapshot`, `subscribe`, `dispatch`, `setConnection`, `resetState`, the mutable `state` binding) directly.
- Import or open a WebSocket, fetch, or any other I/O primitive — **except** the `map` widget, which is permitted exactly one `fetch("/api/track")` call gated behind the debug-overlay flag, as specified by `kiosk-map-widget`.
- Read from `RaceUpdate` types or any backend type.

#### Scenario: No widget imports store internals
- **WHEN** a developer greps `src/frontend/kiosk/widgets/` for `from "@frontend/kiosk/state/store"`
- **THEN** every match imports only the symbol `useRaceState` (and possibly the `RaceState` type), and no widget imports `getSnapshot`, `subscribe`, `dispatch`, `setConnection`, or `resetState`

#### Scenario: No widget performs I/O outside the map debug overlay
- **WHEN** a developer greps `src/frontend/kiosk/widgets/` for `WebSocket`, `fetch(`, or any `ws-client` import
- **THEN** the only matches are inside `src/frontend/kiosk/widgets/map/`, and within that directory the only `fetch` call targets `/api/track` under the debug-overlay branch
