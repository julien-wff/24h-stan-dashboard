## Context

The kiosk frontend today is a single `/kiosk` route that renders `useRaceState()` as JSON. `RaceState`, the reducer, the WebSocket client, and the React store (`useRaceState` via `useSyncExternalStore`) are already in place and stable under `src/frontend/kiosk/state/` — they are the only data source this change consumes. The reference design (`reference/Dashboard.html` + `dashboard-combo.jsx`) is a single 1920×1080 React tree split into hand-coded `CmbLeft / CmbCenter / CmbRight` columns. Reproducing it literally would lock the layout in code; the dashboard needs to change widget-by-widget over the race weekend and beyond, so the page shell must be data-driven.

Constraints carried in from the project:

- **Stack**: Bun + React 18 + HTML imports + **Tailwind v4** (already configured in `src/frontend/index.css` via `bun-plugin-tailwind`). No Vite, no `react-router`, no second styling lib.
- **Design tokens** come exclusively from the `design-system` spec: colors as `bg-panel`, `text-yellow`, `text-text-dim`, `border-border`, …; typography as `font-display`, `font-mono`. **No raw hex literals or inline `style={{ color: '#…' }}` for palette colors** — the design-system spec already forbids it, and this change inherits that rule for every new widget.
- **TypeScript**: `strict`, no `any`, no `!` outside tests; path aliases (`@frontend/*`, `@shared/*`) are mandatory.
- **Code is frontend-only**: nothing under `src/backend/` is touched; `RaceState` stays a frontend concern.
- **No new dependencies** — React + Tailwind v4 + CSS Grid only.
- **Single viewport**: 1920×1080 kiosk; no responsive breakpoints. "Adaptive" here means the widget's body adapts to its grid cell, not to the screen size.

## Goals / Non-Goals

**Goals:**
- A widget runtime where adding a widget is one registry entry and one layout slot reference — no edits to the page shell.
- A layout description that fully determines what is rendered where on the dashboard grid, expressed as data.
- Six real widgets (topbar, speed, stats, sector, lap-progress, lap-times) that match the reference design, all driven by `useRaceState()`.
- Placeholder widgets for the remaining slots (velocity, map, weather, latest-events) so the default layout is visible end-to-end.
- Every widget fills its grid cell (100% × 100%) without depending on a specific pixel size for correctness — so a widget written for the "right column" can be moved to the center column without breaking.

**Non-Goals:**
- Real implementations of the placeholder widgets (waveform, satellite map, weather forecast, event feed) and any `RaceState` extension they would require — they ship in follow-up changes.
- A drag-and-drop / user-editable layout. Layouts are code-defined; swapping is a code change to the layout description, not a runtime feature.
- Multiple layouts, per-user preferences, or layout persistence. v1 ships exactly one layout.
- Responsive breakpoints, container queries, or animation polish.
- Any router library — the existing `location.pathname` branch in `App.tsx` is extended in place.

## Decisions

### 1. Widget contract is `{ id, Component }`, components have no props from the layout

A widget is:

```ts
type Widget = {
  readonly id: string;        // unique, kebab-case
  readonly Component: React.ComponentType;
};
```

Widget components take **no props from the runtime**. They call `useRaceState()` directly (or a memoized selector built on it). They render their own chrome — title bar, borders, padding — using a shared `<Panel>` helper when the standard chrome applies (most widgets) and bespoke markup otherwise (topbar, lap-progress).

**Why no props?** Props would couple the layout description to widget-specific shapes, which defeats the point of a registry where layouts reference widgets by id only. If a widget needs configuration (e.g. "show 8 vs 5 recent laps"), it reads it from a future configuration source, not from the layout slot. For v1, no widget needs configuration.

**Why each widget owns its own chrome?** The reference proves the chrome is non-uniform: the topbar has no panel frame, `lap-progress` puts its title inline with the bar, and the panel-style widgets have small variations in body padding. A forced wrapper would either be too rigid (and break those cases) or so configurable it becomes equivalent to "render your own chrome".

**Alternative considered**: widgets as `(state: RaceState) => ReactNode` functions, with the runtime calling `useRaceState()` once and passing the result down. Rejected — it forces every widget to re-render on every tick, defeating the per-widget memoization React already gives us when each widget subscribes only to the fields it reads (via selector hooks).

### 2. Registry is a static array, not a side-effecting registration call

```ts
// src/frontend/kiosk/widgets/registry.ts
export const widgets: readonly Widget[] = [
  TopbarWidget,
  SpeedWidget,
  StatsWidget,
  SectorWidget,
  LapProgressWidget,
  LapTimesWidget,
  VelocityPlaceholder,
  MapPlaceholder,
  WeatherPlaceholder,
  LatestEventsPlaceholder,
];

export const widgetsById: Readonly<Record<string, Widget>> =
  Object.fromEntries(widgets.map(w => [w.id, w]));
```

**Why static, not side-effecting?** Bun's bundler tree-shakes unused exports, but module-side-effect registries are opaque to it and to tests. A plain array is grep-able, testable, and trivially typed.

**Validation**: a sibling test asserts widget ids are unique and that every slot id in the default layout has a matching widget.

### 3. Layout = CSS Grid template areas + a `slot → widgetId` map

```ts
type GridLayout = {
  readonly columns: string;             // e.g. "440px 1fr 440px"
  readonly rows: string;                // e.g. "auto 1fr auto"
  readonly areas: readonly string[];    // CSS grid-template-areas rows
  readonly gap: number;                 // px
  readonly padding: number;             // px
};

type Layout = {
  readonly topbar: string;              // widgetId rendered in the 128px header row
  readonly grid: GridLayout;
  readonly slots: Readonly<Record<string, string>>;  // area name → widgetId
};
```

The page shell renders (Tailwind utilities + a single `style` prop for the dynamic grid template, which Tailwind v4's arbitrary values would force into a non-statically-extractable class):

```tsx
<div className="grid h-screen w-screen grid-rows-[128px_1fr] bg-bg text-text font-display">
  <WidgetSlot id={layout.topbar} />
  <div
    className="grid min-h-0 min-w-0 overflow-hidden p-4 gap-4"
    style={{
      gridTemplateColumns: layout.grid.columns,
      gridTemplateRows: layout.grid.rows,
      gridTemplateAreas: layout.grid.areas.map(r => `'${r}'`).join(' '),
    }}
  >
    {Object.entries(layout.slots).map(([area, id]) => (
      <div key={area} className="min-h-0 min-w-0" style={{ gridArea: area }}>
        <WidgetSlot id={id} />
      </div>
    ))}
  </div>
</div>
```

Only the three runtime-driven grid properties live in `style`; everything else (colors, fonts, paddings, `min-w-0`, `overflow-hidden`) is Tailwind. `WidgetSlot` itself wraps the widget in a `h-full w-full` block so widgets always receive a full cell.

**Why grid-template-areas, not row/col spans?** Areas read like the picture they produce, which is exactly what we want when a human is editing a layout. Spans are equivalent in power but harder to scan.

**Why one named topbar slot instead of putting it in the grid?** The topbar's row is fixed at 128 px and never participates in any layout variant we expect — pulling it out keeps the content grid uniform and the topbar swap explicit (different brand = different topbar widget id; same grid).

**Default layout** (`src/frontend/kiosk/widgets/layouts/default.ts`) encodes the reference:

```
columns: "440px 1fr 440px"
rows:    "auto auto 1fr auto"
areas:   ["speed   map         sector",
         "velocity map         lap-times",
         "stats    map         lap-times",
         "stats    lap-progress weather",
         "stats    lap-progress latest-events"]
```

(Exact row sizing is tuned during implementation; the schema is what's load-bearing.)

### 4. Widgets fill the cell; styling is Tailwind + design-system tokens

The slot wrapper applies `h-full w-full min-w-0 min-h-0` (the last two are the CSS Grid escape hatch for overflowing children). Widgets MUST NOT set a fixed `w-[...px]` or `h-[...px]` on their outermost element — they use `h-full w-full` and let flex/grid distribute internal regions.

**Styling rules**:
- Colors and font families come exclusively from the `design-system` tokens (`bg-panel`, `text-yellow`, `text-text-dim`, `text-text-dimmer`, `border-border`, `text-green`, `text-amber`, `text-red`, `text-purple`, `font-display`, `font-mono`). No raw hex literals anywhere in widget code; no `style={{ color }}` for palette colors. This is already a `design-system` spec rule — we just inherit it.
- Numerals that change at runtime use `font-mono tabular-nums` so digits don't jitter frame to frame (already a documented project convention).
- For typography that should scale with the cell's width, widgets use Tailwind arbitrary values backed by `clamp()`: e.g. `text-[clamp(72px,9vw,138px)]` on the speed numeral. The reference pixel size becomes the `max`; the `min` is the smallest readable size for that text. This means a widget moved from the 440 px right column into the 1fr centre column scales up automatically.
- Borders/backgrounds for the standard panel chrome live on the shared `<Panel>` helper, so individual widgets don't repeat the `border border-border bg-panel` chrome.

**Why `clamp()` over `vw` and not container queries?** Container queries work, but require a `container-type` declaration on each slot wrapper and force layouts in tests. `clamp()` over `vw` is one Tailwind class per typographic rule and good enough for a single 1920×1080 viewport with three possible column widths. We can adopt container queries later without changing the widget contract.

**Why not enforce "fills the cell" in the type?** A widget that violates it is a bug, not a type error. A test in `widgets/contract.test.tsx` mounts each widget at a small and a large fixed-size frame and asserts no horizontal overflow on the rendered tree — that's where the rule is checked.

### 5. State reads stay decentralised — no global selector layer

Each widget calls `useRaceState()` and destructures the fields it needs. Selector memoization is added only if a profile shows wasted renders; for v1, every widget is cheap enough that the React 18 `useSyncExternalStore` plumbing already in `store.ts` covers it.

**Why not a selector hook per widget right now?** YAGNI. The store fires one notification per dispatch, and at ~1 Hz that's negligible. We add `useRaceStateSelector(sel)` the moment a widget shows up as a render hotspot.

### 6. `/kiosk` becomes the dashboard, `/kiosk/debug` keeps the JSON view

`App.tsx` currently branches on `location.pathname === "/kiosk"`. We extend it:

```ts
if (location.pathname === "/kiosk") return <KioskPage />;
if (location.pathname === "/kiosk/debug") return <DebugPage />;
return <h1>Hello, World!</h1>;
```

`KioskPage` is the new component that reads the default layout and renders the shell described above. `DebugPage` is the existing JSON renderer, kept verbatim — it's invaluable during bring-up and costs nothing.

**Why not delete `DebugPage`?** It's the canonical sanity check that the store wiring still works. If a future widget bug looks like missing data, the debug page tells you whether the data is missing in the store or only in the widget.

### 7. File layout

```
src/frontend/kiosk/
├── DebugPage.tsx              (unchanged)
├── KioskPage.tsx              (new) — mounts <WidgetHost layout={defaultLayout} />
├── state/                     (unchanged)
├── ws-client.ts               (unchanged)
└── widgets/
    ├── types.ts               — Widget, Layout, GridLayout types
    ├── registry.ts            — `widgets`, `widgetsById`
    ├── host.tsx               — <WidgetHost>, <WidgetSlot>, <Panel>
    ├── layouts/
    │   └── default.ts         — defaultLayout
    ├── topbar/                — index.ts (Widget), Component.tsx
    ├── speed/
    ├── stats/
    ├── sector/
    ├── lap-progress/
    ├── lap-times/
    └── placeholder.tsx        — placeholder(id, title) helper used by velocity, map, weather, latest-events
```

`KioskPage.tsx` and `WidgetHost` only depend on `registry.ts` + the layout. Widgets only depend on `state/` and `host.tsx` (`Panel`).

## Risks / Trade-offs

- **Risk: `clamp()`-based typography drifts from the reference at edge column widths** → Mitigation: pin the `clamp()` `max` to the reference pixel size and let visual review catch regressions; if drift is unacceptable we add container queries (one Tailwind class per widget) without changing the contract.
- **Risk: a widget reintroduces hex literals or inline color styles** → Mitigation: the `design-system` spec already forbids this and a Biome rule + visual code review catches it; reaffirmed for every new widget in this change.
- **Risk: a widget reads fields from `RaceState` that the reducer doesn't populate yet** (e.g. `speedHistory` for the speed bar history) → Mitigation: only the *real* widgets are in scope, and their data is already in `RaceState`. The speed widget's bar history is optional chrome — if the field is empty, it renders nothing. Anything beyond that (velocity waveform, weather, events) lives behind a placeholder and is intentionally out of scope.
- **Risk: grid-template-areas hand-edited as strings invite typos** → Mitigation: a test loads `defaultLayout` and asserts (a) every token in `areas` is either `.` or a key of `slots`, (b) every key of `slots` is referenced in `areas` at least once, (c) every value of `slots` is an id present in `widgetsById`.
- **Trade-off: no widget props** → simpler runtime, but widget configuration becomes a future schema change rather than a layout-level concern. Acceptable for v1 where no widget needs configuration.
- **Trade-off: each widget calls `useRaceState()` independently** → every store notification wakes every mounted widget. At ~1 Hz this is invisible; if it becomes a problem, switch to a selector hook per widget without touching the contract.

## Migration Plan

This is a frontend-only change with no shipped users; "migration" is the order of code changes:

1. Land `widgets/types.ts`, `widgets/host.tsx`, `widgets/placeholder.tsx`, `widgets/registry.ts` empty-but-typed, plus `widgets/layouts/default.ts` referencing not-yet-implemented widget ids. Tests for layout consistency pass against the empty registry by failing the missing-widget check.
2. Implement each widget (topbar, speed, stats, sector, lap-progress, lap-times) one PR-sized chunk at a time; tests turn green slot by slot.
3. Register the four placeholders.
4. Wire `App.tsx` to mount `<KioskPage />` at `/kiosk` and move the existing debug view to `/kiosk/debug`.

Rollback is `git revert` of the App.tsx wiring commit — the old `DebugPage` route remains intact throughout.

## Open Questions

- Exact row sizing in the default grid (the `rows: "auto auto 1fr auto"` sketch above is approximate). Resolved during implementation against a 1920×1080 screenshot; the spec mandates the column/area structure, not the precise row template.
- Whether `<Panel>` should expose a `right` slot (the reference uses it for "LIVE", "L42", "dT 1s"). Inclined to yes — it's a common pattern across three widgets — but if only one widget ends up using it, we drop it. Decided during widget implementation, not blocking the runtime.
