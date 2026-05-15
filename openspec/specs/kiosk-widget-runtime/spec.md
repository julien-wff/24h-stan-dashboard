# kiosk-widget-runtime Specification

## Purpose

Defines the frontend widget runtime for the kiosk dashboard: the `Widget` contract (id + component, no props), the static registry indexed by id, the data-driven `Layout` type that describes the topbar plus a CSS-grid content area with named slots, layout validation invariants, the `WidgetHost` / `WidgetSlot` shell that renders a layout, and the routing wiring that mounts the dashboard at `/kiosk` while preserving the legacy JSON view at `/kiosk/debug`. Also fixes the widget styling contract (Tailwind tokens only, no palette hex literals, cell-filling outer element) and exposes a `placeholder(id, title)` helper for slots that have not yet shipped a real widget. This capability is purely frontend; nothing under `src/backend/` may import from it.

## Requirements

### Requirement: Widget contract exposes id and component only

A widget SHALL be a `Widget` value with exactly two readonly fields: a unique kebab-case `id: string` and a `Component: React.ComponentType` that takes no props. The type SHALL live in `src/frontend/kiosk/widgets/types.ts`:

```ts
type Widget = {
  readonly id: string;
  readonly Component: React.ComponentType;
};
```

The widget runtime SHALL NOT pass any props to the widget component when rendering it. A widget that needs to read race state SHALL call `useRaceState()` (from `@frontend/kiosk/state/store`) inside its component body; no other data source is allowed for v1.

`Widget` MUST NOT be imported anywhere under `src/backend/`.

#### Scenario: Widget type has no props field
- **WHEN** `Widget` is read from `src/frontend/kiosk/widgets/types.ts`
- **THEN** its `Component` field is typed as `React.ComponentType` (i.e. takes no props), and the type exposes no other fields beyond `id` and `Component`

#### Scenario: Backend tree does not import Widget
- **WHEN** a developer greps `src/backend/` for imports from `@frontend/kiosk/widgets`
- **THEN** no matches are found

#### Scenario: Widget reads state via useRaceState
- **WHEN** any registered widget's component code is read
- **THEN** if it accesses race state at all, it does so by calling `useRaceState()`, not by importing the store internals (`getSnapshot`, `subscribe`, `dispatch`, `state` directly)

### Requirement: Registry is a static array indexed by id

The widget registry SHALL live in `src/frontend/kiosk/widgets/registry.ts` and SHALL export:

- `widgets: readonly Widget[]` — a static array of every widget available to the runtime.
- `widgetsById: Readonly<Record<string, Widget>>` — `Object.fromEntries(widgets.map(w => [w.id, w]))`, computed at module load.

Every `Widget` in `widgets` SHALL have a unique `id`. Registration SHALL be done by adding the widget to the `widgets` array — there is no `register()` function, no module side effect, and no dynamic registration.

#### Scenario: Widget ids are unique
- **WHEN** `widgets` is iterated
- **THEN** no two entries share the same `id` (verified by a test that asserts `new Set(widgets.map(w => w.id)).size === widgets.length`)

#### Scenario: widgetsById maps every id to its widget
- **WHEN** `widgetsById[w.id]` is read for any `w` in `widgets`
- **THEN** it returns the same widget reference as `w`

### Requirement: Layout describes topbar and content grid as data

A `Layout` SHALL be a value of the following shape, defined in `src/frontend/kiosk/widgets/types.ts`:

```ts
type GridLayout = {
  readonly columns: string;             // CSS grid-template-columns
  readonly rows: string;                // CSS grid-template-rows
  readonly areas: readonly string[];    // each entry is one grid-template-areas row
  readonly gap: number;                 // px
  readonly padding: number;             // px
};

type Layout = {
  readonly topbar: string;              // widget id rendered above the content grid
  readonly grid: GridLayout;
  readonly slots: Readonly<Record<string, string>>; // area name → widget id
};
```

A layout SHALL satisfy these invariants:

1. Every token that appears in `grid.areas` (whitespace-separated, excluding `.` which means "empty cell") MUST be a key of `slots`.
2. Every key of `slots` MUST appear at least once as a token in `grid.areas`.
3. Every value of `slots` MUST be the `id` of a widget present in `widgetsById`.
4. `topbar` MUST be the `id` of a widget present in `widgetsById`.

A `validateLayout(layout: Layout): void` function SHALL be exported from `src/frontend/kiosk/widgets/host.tsx` (or a sibling) that throws a descriptive error if any invariant is violated. The kiosk page SHALL call `validateLayout(defaultLayout)` at module load, so an invalid default layout fails the build / first render rather than silently rendering a broken page.

#### Scenario: Layout with an area not in slots fails validation
- **WHEN** `validateLayout` is called on a layout whose `grid.areas` contains a token `"map"` but whose `slots` has no `"map"` key
- **THEN** `validateLayout` throws an error naming the missing slot

#### Scenario: Layout with a slot id not in the registry fails validation
- **WHEN** `validateLayout` is called on a layout whose `slots["speed"]` is `"speed-extreme"` but `widgetsById["speed-extreme"]` is undefined
- **THEN** `validateLayout` throws an error naming the unknown widget id

#### Scenario: Layout with an orphan slot fails validation
- **WHEN** `validateLayout` is called on a layout whose `slots` defines `"weather"` but `grid.areas` never references `"weather"`
- **THEN** `validateLayout` throws an error naming the orphan slot

### Requirement: Page shell renders topbar + content grid from the layout

A `KioskPage` component SHALL live in `src/frontend/kiosk/KioskPage.tsx` and render the default layout via a `WidgetHost` component from `src/frontend/kiosk/widgets/host.tsx`. The shell SHALL:

1. Render a top-level element with `grid-rows-[128px_1fr] h-screen w-screen` using Tailwind utilities, and apply the `bg-bg text-text font-display` palette from the `design-system` spec.
2. Render the widget identified by `layout.topbar` as the first row.
3. Render the content grid as the second row, using `gridTemplateColumns`, `gridTemplateRows`, and `gridTemplateAreas` computed from `layout.grid`; `gap` and `padding` from `layout.grid.gap` / `padding`.
4. For each `[area, widgetId]` in `layout.slots`, render a wrapper `<div>` with `gridArea: area`, Tailwind classes `min-w-0 min-h-0`, containing the widget identified by `widgetId`.
5. Wrap every mounted widget in a `<WidgetSlot>` whose outer element is `h-full w-full min-w-0 min-h-0`.

Only the three dynamic grid CSS properties (`gridTemplateColumns`, `gridTemplateRows`, `gridTemplateAreas`) MAY be set via the `style` prop on the content grid container. All other styling on the shell SHALL be Tailwind utilities.

#### Scenario: Shell uses Tailwind for the page row template
- **WHEN** the kiosk page is rendered
- **THEN** the outermost element has Tailwind class `grid-rows-[128px_1fr]` (not an inline `gridTemplateRows` style)

#### Scenario: Content grid container places widgets in their declared areas
- **WHEN** the kiosk page renders a layout whose `slots["sector"] === "sector"`
- **THEN** the rendered DOM contains a `<div>` with computed `grid-area: sector` containing the output of the `sector` widget's `Component`

#### Scenario: WidgetSlot fills the cell
- **WHEN** any widget is rendered through `WidgetSlot`
- **THEN** `WidgetSlot`'s outer element has the Tailwind classes `h-full w-full min-w-0 min-h-0`

### Requirement: `/kiosk` mounts the dashboard, `/kiosk/debug` keeps the JSON view

`App.tsx` SHALL route based on `location.pathname`:

- `"/kiosk"` → renders `<KioskPage />` (the new dashboard).
- `"/kiosk/debug"` → renders `<DebugPage />` (the existing JSON view of `useRaceState()`).
- Any other path → unchanged from the current behavior.

`DebugPage` SHALL NOT be deleted; it remains the canonical store sanity check.

#### Scenario: /kiosk renders the dashboard
- **WHEN** the browser is at `/kiosk`
- **THEN** `App.tsx` renders `KioskPage`, which mounts the topbar widget and the content grid; `DebugPage` is not mounted

#### Scenario: /kiosk/debug renders the JSON view
- **WHEN** the browser is at `/kiosk/debug`
- **THEN** `App.tsx` renders `DebugPage`, which renders the live race state as JSON; `KioskPage` is not mounted

### Requirement: Widgets fill their cell and do not set fixed pixel sizes on their outer element

Every widget's outermost rendered element SHALL use `h-full w-full` (or a CSS equivalent that produces the same computed size) and SHALL NOT set a fixed pixel `width` or `height` either via the Tailwind arbitrary-value syntax (`w-[Xpx]`, `h-[Xpx]`) or via inline `style`. Internal regions MAY use fixed sizes.

This invariant is checked by `src/frontend/kiosk/widgets/contract.test.tsx`, which mounts every widget in `widgets` inside two fixed-size frames (a "small" 200×200 frame and a "large" 800×600 frame) and asserts that the rendered tree has no horizontal overflow at either size.

#### Scenario: Each widget fills its frame
- **WHEN** the contract test mounts a widget inside a 200×200 frame
- **THEN** the widget's outermost element has computed `width` and `height` equal to the frame's dimensions

#### Scenario: No widget overflows horizontally in either frame
- **WHEN** the contract test mounts a widget inside the small 200×200 frame
- **THEN** every descendant's `scrollWidth` is less than or equal to the frame's `clientWidth`

### Requirement: Widget styling uses design-system Tailwind tokens

Widget components SHALL style themselves exclusively via Tailwind utilities, using only color and font tokens from the `design-system` spec (`bg-bg`, `bg-panel`, `border-border`, `text-text`, `text-text-dim`, `text-text-dimmer`, `text-yellow`, `text-green`, `text-amber`, `text-red`, `text-purple`, `font-display`, `font-mono`, and the `*-ground`, `*-building`, `*-park`, `*-road`, `*-track-area` tokens for any map-style widgets).

Widget code MUST NOT contain raw hex literals for palette colors (e.g. `#fbe216`, `rgba(255,255,255,0.7)`) nor inline `style={{ color: '#…' }}` for palette colors. The only inline `style` allowed in widget code is for values that cannot be expressed as a Tailwind class (e.g. a `gridArea` name derived from data, or a percentage width derived from `useRaceState()`).

Numerals driven by live race state SHALL use `font-mono tabular-nums`.

#### Scenario: Widget code contains no palette hex literals
- **WHEN** a contributor adds or modifies a widget file under `src/frontend/kiosk/widgets/`
- **THEN** that file contains no string matching `#fbe216`, `#0a0a0a`, `#13130f`, `#00d97e`, `#ffb000`, `#ff3b3b`, `#bf5af2`, `#ffffff`, or the rgba literals listed in the `design-system` spec — palette colors are referenced via Tailwind utilities only

#### Scenario: Live numerals are mono and tabular
- **WHEN** any widget renders a number that updates from `RaceState`
- **THEN** that number's containing element has both `font-mono` and `tabular-nums` Tailwind classes

### Requirement: Placeholder widget factory renders title + empty body

A `placeholder(id: string, title: string): Widget` helper SHALL live in `src/frontend/kiosk/widgets/placeholder.tsx` and SHALL return a `Widget` whose `Component` renders the standard panel chrome (via the shared `<Panel>` helper) with:

- the given `title` as the panel header,
- an empty body region (a `<div>` with the panel body styling but no content children).

Placeholder widgets SHALL NOT subscribe to `useRaceState()` (a placeholder has no live data) and SHALL fill their cell like every other widget.

#### Scenario: Placeholder renders the given title in the header
- **WHEN** `placeholder("weather", "WEATHER · NANCY").Component` is rendered
- **THEN** the rendered output contains the text `WEATHER · NANCY` in the panel header position

#### Scenario: Placeholder body is empty
- **WHEN** a placeholder widget is rendered
- **THEN** its body region (the element directly below the header) contains no text content
