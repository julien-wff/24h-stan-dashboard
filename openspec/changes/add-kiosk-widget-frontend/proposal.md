## Why

The kiosk frontend currently only exposes a `/kiosk` debug page that renders `RaceState` as JSON. We need to deliver the actual TV dashboard described in the README and the reference design (`reference/Dashboard.html`) — readable at 3–5 m, glanceable in <3 s — but the dashboard's content will evolve through the race weekend (and beyond), so the architecture must let us drop new widgets in, swap one for another, and rearrange the grid without rewriting the page. This change introduces the widget runtime that makes that possible and ships the first concrete widgets on top of it.

## What Changes

- Introduce a **widget runtime**: a typed widget contract (`Widget` = id + render component + the state-slice it consumes), a registry that maps widget ids to implementations, and a **layout description** that places widgets onto named slots of the dashboard grid.
- Render the kiosk page as a **128 px topbar row + content grid** (matching the reference design's `gridTemplateRows: '128px 1fr'` shell). The topbar is a single slot; the content grid has named areas filled by widgets looked up from the registry by id.
- The default layout reproduces the reference: a 3-column content grid (left ≈ 440 px, center 1fr, right ≈ 440 px) with stacked slots:
  - **Left column**: `speed` (real), `velocity` (placeholder), `stats` (real).
  - **Center column**: `map` (placeholder, takes the rest of the column), `lap-progress` (real, single row at the bottom).
  - **Right column**: `sector` (real), `lap-times` (real, flex), `weather` (placeholder), `latest-events` (placeholder).
- Widgets are **shape-adaptive, not size-fixed**: every widget fills the grid cell it is placed in (100% width / 100% height, no hard-coded pixel dimensions). Widgets may adapt their internal density to the cell's aspect ratio but do not assume specific pixel dimensions, so they remain swappable across grid positions.
- Widgets are **swappable**: changing the dashboard is a data change (a layout description that pairs slot names with widget ids) — adding a new widget is a registry entry plus a layout slot, no changes to the page shell.
- Implement six real widgets matching the reference design, all reading from the existing `useRaceState` store (`kiosk-client-state`):
  - **topbar** — CESI brand block (left), elapsed timer (center), sensor health + lap number (right).
  - **speed** — large yellow km/h numeral with TOP/AVG sub-line and a short bar history.
  - **stats** — key/value list (distance, avg speed, top speed, calories, pit stops).
  - **sector** — four sector rows with active indicator and last/best times.
  - **lap-progress** — horizontal progress bar with sector boundaries + current lap time.
  - **lap-times** — best/last summary header + recent-laps list with delta vs best.
- For every other slot in the default layout (`velocity`, `map`, `weather`, `latest-events`), register a **placeholder widget** that renders the section title and an empty body, so the full layout is visible end-to-end and follow-up changes can replace placeholders one at a time.
- Replace the `/kiosk` route's content: the page now renders the dashboard via the widget runtime. The existing JSON debug view moves to `/kiosk/debug` so it stays available during bring-up.
- No new data flow is introduced; widgets consume `useRaceState` selectors only. Fields not yet present in `RaceState` (e.g. `speedHistory`, `weather`, `recentEvents`) belong to the placeholder widgets only — extending the store is out of scope and lives in the follow-up changes that replace each placeholder.

## Capabilities

### New Capabilities
- `kiosk-widget-runtime`: widget contract, widget registry, layout description schema, grid placement primitive, and the kiosk page shell (topbar row + content grid). Owns *how* widgets are declared, registered, placed, and swapped — not what any specific widget shows.
- `kiosk-dashboard-layout`: the concrete widgets shipped in v1 (topbar, speed, stats, sector, lap-progress, lap-times) plus placeholder widgets for the remaining slots (velocity, map, weather, latest-events), and the default layout description that places them on the grid. Owns *what* the v1 kiosk dashboard looks like.

### Modified Capabilities
*(none — `kiosk-client-state` is consumed read-only via its existing public store; its spec is unchanged.)*

## Impact

- **Code**: new tree under `src/frontend/kiosk/widgets/` (runtime, registry, layout primitive, six real widget implementations, placeholder widget); `App.tsx` and the `/kiosk` route rewired to mount the dashboard shell; the current JSON view moves to `/kiosk/debug`.
- **Specs**: two new spec files (`kiosk-widget-runtime`, `kiosk-dashboard-layout`). No changes to existing specs.
- **Reference**: the canonical design is checked in at `openspec/changes/add-kiosk-widget-frontend/reference/` (`Dashboard.html`, `dashboard-combo.jsx`) for use during implementation and review.
- **Dependencies**: none added — React + CSS Grid only. Styling follows the tokens already defined by `design-system`.
- **Runtime**: no backend changes; the WebSocket event stream and store contract are untouched.
- **Out of scope**: real implementations of the placeholder widgets (velocity waveform, map, weather, latest events), any extension of `RaceState` to support them, animation polish, and any responsive behavior beyond filling the assigned grid cell — those land in follow-up changes that only need to add a registry entry and (where required) extend the store.
