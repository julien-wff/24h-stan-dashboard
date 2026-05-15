## 1. Runtime scaffold (types, registry, host, page)

- [x] 1.1 Create `src/frontend/kiosk/widgets/types.ts` exporting `Widget`, `GridLayout`, `Layout` exactly as specified in `kiosk-widget-runtime` (readonly fields, no widget props).
- [x] 1.2 Create `src/frontend/kiosk/widgets/registry.ts` exporting `widgets: readonly Widget[] = []` (empty for now) and `widgetsById = Object.fromEntries(widgets.map(w => [w.id, w]))`.
- [x] 1.3 Add `src/frontend/kiosk/widgets/registry.test.ts` asserting `new Set(widgets.map(w => w.id)).size === widgets.length` and that `widgetsById[w.id] === w` for every widget.
- [x] 1.4 Create `src/frontend/kiosk/widgets/host.tsx` exporting `<Panel title right>`, `<WidgetSlot id>`, `<WidgetHost layout>`, and `validateLayout(layout)`. `WidgetSlot` wraps its widget in `h-full w-full min-w-0 min-h-0`. `WidgetHost` renders `grid-rows-[128px_1fr] h-screen w-screen bg-bg text-text font-display` with the topbar slot above the content grid; only `gridTemplateColumns`, `gridTemplateRows`, and `gridTemplateAreas` go through inline `style`.
- [x] 1.5 Add `src/frontend/kiosk/widgets/host.test.tsx` covering the three `validateLayout` failure modes (area not in slots, slot id not in registry, orphan slot) and a happy-path call.
- [x] 1.6 Create `src/frontend/kiosk/widgets/placeholder.tsx` exporting `placeholder(id, title): Widget` that returns a widget rendering `<Panel title={title}>` with an empty body and does not call `useRaceState`.
- [x] 1.7 Add `src/frontend/kiosk/widgets/placeholder.test.tsx` asserting the rendered output contains the title in the header and no text in the body, and that the source file does not import `useRaceState`.

## 2. Default layout

- [x] 2.1 Create `src/frontend/kiosk/widgets/layouts/default.ts` exporting `defaultLayout: Layout` with `topbar: "topbar"`, `grid.columns: "440px 1fr 440px"`, `gap: 16`, `padding: 16`, `grid.rows` chosen so the centre `map` and the right-column `lap-times` use `1fr`, and `grid.areas` placing `speed/velocity/stats` left, `map/lap-progress` centre, `sector/lap-times/weather/latest-events` right.
- [x] 2.2 Make `defaultLayout.slots` contain exactly the nine keys `lap-progress`, `lap-times`, `latest-events`, `map`, `sector`, `speed`, `stats`, `velocity`, `weather`, each mapped to the widget id of the same name.
- [x] 2.3 Add `src/frontend/kiosk/widgets/layouts/default.test.ts` asserting (a) `validateLayout(defaultLayout)` throws while the registry is still empty (proves the validator runs), (b) once the registry is populated the layout passes, (c) the sorted slot keys equal the documented list, (d) every `slots[k] === k`, (e) `columns === "440px 1fr 440px"`.

## 3. Page wiring

- [x] 3.1 Create `src/frontend/kiosk/KioskPage.tsx` that calls `validateLayout(defaultLayout)` at module load and renders `<WidgetHost layout={defaultLayout} />`.
- [x] 3.2 Update `src/frontend/App.tsx` to route `/kiosk` → `<KioskPage />`, `/kiosk/debug` → `<DebugPage />`, everything else unchanged. Keep `DebugPage` import intact.
- [x] 3.3 Add `src/frontend/App.test.tsx` (or extend an existing one) asserting both routes mount the right component and the unknown-path fallback is untouched.

## 4. Topbar widget

- [x] 4.1 Create `src/frontend/kiosk/widgets/topbar/Component.tsx` with the 3-region layout (left brand block with `bg-yellow text-black`, centre elapsed group, right sensor + lap). Use the lap helper that returns the highest key in `state.laps` (or `0` when empty) and pad to 3 digits. Elapsed time formatter (`H:MM:SS`) lives in `src/frontend/kiosk/widgets/format.ts`.
- [x] 4.2 Create `src/frontend/kiosk/widgets/topbar/index.ts` exporting `TopbarWidget: Widget = { id: "topbar", Component }` and register it in `widgets`.
- [x] 4.3 Add `src/frontend/kiosk/widgets/topbar/Component.test.tsx` covering: elapsed time `3725 → "1:02:05"`, highest lap `7 → "007"`, empty laps → `"000"`, sensor health falls back to `—` for absent fields, lap numeral has `text-yellow font-mono tabular-nums`.

## 5. Speed widget

- [x] 5.1 Create `src/frontend/kiosk/widgets/speed/Component.tsx` rendering `<Panel title="SPEED">` with the yellow `text-[clamp(72px,9vw,138px)]` `font-mono tabular-nums` numeral, the `km/h` label, and a TOP/AVG sub-row. `—` fallback when `state.speed` is `null`; TOP/AVG render `—` when their source fields are absent.
- [x] 5.2 Create `src/frontend/kiosk/widgets/speed/index.ts`, register in `widgets`.
- [x] 5.3 Add `src/frontend/kiosk/widgets/speed/Component.test.tsx` covering: `speed: 28.4 → "28"` in `text-yellow font-mono tabular-nums`, `speed: null → "—"`, panel header text `SPEED`, no bar history rendered when `speedHistory` is absent.

## 6. Stats widget

- [x] 6.1 Create `src/frontend/kiosk/widgets/stats/Component.tsx` rendering `<Panel title="STATS">` with five rows in order — DISTANCE, AVG SPEED, TOP SPEED (`text-green`), CALORIES (`text-amber`, with `2 PEDALERS` sub-label), PIT STOPS. Values use `font-mono tabular-nums`; absent source fields render `—`.
- [x] 6.2 Create `src/frontend/kiosk/widgets/stats/index.ts`, register in `widgets`.
- [x] 6.3 Add `src/frontend/kiosk/widgets/stats/Component.test.tsx` covering row order, TOP SPEED in `text-green`, all `—` when source fields absent.

## 7. Sector widget

- [x] 7.1 Define `SECTOR_NAMES` and a shared `sectorBoundaryS` constant array in `src/frontend/kiosk/widgets/sector/constants.ts` (also consumed by the lap-progress widget).
- [x] 7.2 Create `src/frontend/kiosk/widgets/sector/Component.tsx` rendering `<Panel title="SECTORS">` with four rows: indicator square (`bg-yellow` when active, dim otherwise), name (`text-text` when active, `text-text-dim` otherwise), and time (`text-purple` when `last` matches `best` within 0.05 s, `text-text` otherwise; `—:——` when null). Use `state.sector` and `state.sectors`.
- [x] 7.3 Create `src/frontend/kiosk/widgets/sector/index.ts`, register in `widgets`.
- [x] 7.4 Add `src/frontend/kiosk/widgets/sector/Component.test.tsx` covering the four documented names in order, active row highlight when `sector === 2`, purple coloring when `last === best`, `—:——` placeholder when `last` is `null`.

## 8. Lap-progress widget

- [x] 8.1 Create `src/frontend/kiosk/widgets/lap-progress/Component.tsx` — single horizontal `bg-panel border border-border` strip with `LAP PROGRESS` label, a bar with `bg-yellow` fill at `width: <s * 100>%` (inline `style` allowed for this dynamic width), three sector ticks pulled from the shared `sectorBoundaryS` constant, percentage in `font-mono tabular-nums text-text`, current lap time in `font-mono tabular-nums text-yellow`. Fall back to `0%` and `—:——` when source fields are null.
- [x] 8.2 Create `src/frontend/kiosk/widgets/lap-progress/index.ts`, register in `widgets`. Note this widget does NOT use the standard `<Panel>` chrome — it renders its own strip.
- [x] 8.3 Add `src/frontend/kiosk/widgets/lap-progress/Component.test.tsx` covering: fill width `47.3%` when `s = 0.473`, expected Tailwind classes on the percentage and lap-time elements, graceful nulls.

## 9. Lap-times widget

- [x] 9.1 Create `src/frontend/kiosk/widgets/lap-times/Component.tsx` rendering `<Panel title="LAP TIMES" right={\`L\${highestLap}\`}>` with a 2-column summary (BEST in `text-purple`, LAST in `text-yellow`, `Δ` sub-label) and a list region of up to 8 recent laps in reverse order. Colour rules: `text-purple` for the best lap row, `text-green` for laps within 5% of best, `text-text-dim` otherwise. Em-dash placeholders when there is no best or no laps.
- [x] 9.2 Create `src/frontend/kiosk/widgets/lap-times/index.ts`, register in `widgets`.
- [x] 9.3 Add `src/frontend/kiosk/widgets/lap-times/Component.test.tsx` covering: best row coloured `text-purple` with `BEST` chip, last value in `text-yellow`, empty state renders `—:——` twice and no list rows.

## 10. Placeholder registrations

- [x] 10.1 Register `placeholder("velocity", "VELOCITY · 240s")`, `placeholder("map", "PLACE DE LA CARRIÈRE · NANCY")`, `placeholder("weather", "WEATHER · NANCY")`, `placeholder("latest-events", "LATEST EVENTS")` in `widgets`.
- [x] 10.2 Confirm none of the placeholder registration files import `useRaceState` (re-run `placeholder.test.tsx` grep assertion at the registry level).

## 11. Cross-cutting verification

- [x] 11.1 Add `src/frontend/kiosk/widgets/contract.test.tsx` that, for each widget in `widgets`, mounts the widget inside a 200×200 and an 800×600 fixed-size frame and asserts (a) the widget's outermost element has computed `width`/`height` equal to the frame, (b) no descendant has `scrollWidth > clientWidth` at either size.
- [x] 11.2 Add a "no hex literals" grep test under `src/frontend/kiosk/widgets/` (Bun test that reads every `.tsx`/`.ts` file in the tree and fails if it matches any of `#fbe216`, `#0a0a0a`, `#13130f`, `#00d97e`, `#ffb000`, `#ff3b3b`, `#bf5af2`, `#ffffff`, or the three documented rgba literals).
- [x] 11.3 Add a "no store internals or I/O" grep test under `src/frontend/kiosk/widgets/` asserting no file imports `getSnapshot`, `subscribe`, `dispatch`, `setConnection`, `resetState`, opens a `WebSocket`, or calls `fetch(`.
- [x] 11.4 Eyeball the dashboard end-to-end: `bun --hot src/backend/index.ts`, open `/kiosk` in the browser, sanity-check the six real widgets render against the placeholder backend state, then open `/kiosk/debug` to confirm the JSON view is intact.

## 12. Quality gates

- [x] 12.1 Run `bun test` and fix any failures.
- [x] 12.2 Run `bun run check` and fix any formatter/linter/import-sort issues (no `biome-ignore` suppressions).
- [x] 12.3 Run `bunx tsc --noEmit` (or the project's equivalent type-check command if present) and resolve any type errors.
- [x] 12.4 Run `bunx openspec validate add-kiosk-widget-frontend` to confirm the change is still consistent before handing off.
