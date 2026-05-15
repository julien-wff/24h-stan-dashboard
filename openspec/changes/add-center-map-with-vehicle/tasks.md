## 1. Asset & backend route

- [ ] 1.1 Move `track-satellite-dark.webp` from the repo root to `src/frontend/kiosk/assets/track-satellite-dark.webp` (use `git mv` so history follows).
- [ ] 1.2 Add the `GET /api/track` route to `src/backend/index.ts`, registered only when `kioskHandle` is defined; the handler returns `{ points: kioskHandle.centerline.points.map(p => ({ lat: p.lat, lon: p.lon })), totalMeters: kioskHandle.centerline.totalMeters }` as JSON.
- [ ] 1.3 Add a backend test asserting the route returns 200 + the expected shape under `APP_MODE=kiosk` and returns 404 when `APP_MODE` is unset.
- [ ] 1.4 Smoke test by hand: `bun run dev` with `APP_MODE=kiosk`, then `curl http://localhost:<port>/api/track | jq` returns the polyline.

## 2. Projection module

- [ ] 2.1 Create `src/frontend/kiosk/widgets/map/project.ts` exporting `projectLatLonToImage(lat, lon)` and the georef constants (`CENTER`, `ROT`, `SCALE`, `IMAGE_W`, `IMAGE_H`).
- [ ] 2.2 Implement the local-tangent-plane transform: lat/lon → east/north metres → rotated & scaled → image pixels (origin top-left, y-down).
- [ ] 2.3 Write `project.test.ts` covering: centre lat/lon → image centre; pure-function determinism; round-trip via an analytic inverse to within 1e-6°.
- [ ] 2.4 Calibrate rotation sign / y-flip empirically using the GPX debug overlay during step 3.5; pin the resolved transform in the unit test.

## 3. Map widget

- [ ] 3.1 Create `src/frontend/kiosk/widgets/map/index.ts` exporting `MapWidget: Widget` (`id: "map"`, `Component: MapComponent`).
- [ ] 3.2 Create `src/frontend/kiosk/widgets/map/Component.tsx` rendering the `Panel` chrome with title `PLACE DE LA CARRIÈRE · NANCY`, the satellite image as `background-image` with `background-size: contain` (or `<img object-fit: contain>`), and a `<svg>` overlay sized to the panel via `ResizeObserver`.
- [ ] 3.3 Use `useRaceState()` to read `lat`, `lon`, `heading`, `updatedAt`. Render the marker (yellow disc + halo + chevron) at the projected pixel only when `lat`/`lon` are finite; hide the chevron when `heading` is null.
- [ ] 3.4 Style all SVG primitives with Tailwind utility classes only: `fill-yellow`, `stroke-black/60 stroke-2` for the disc, `fill-yellow/40` for the halo, `fill-yellow` for the chevron, `stroke-yellow/40 stroke-[3px] fill-none` for the trail polyline. No raw hex or `rgba(...)` in attributes.
- [ ] 3.5 Maintain a 30-sample trail buffer in `useRef`; push on each tick where `(lat, lon)` changes; clear on GPS loss; render the buffer as one `<polyline>` behind the marker.
- [ ] 3.6 Add the CSS pulse animation (1.2 s loop on opacity + scale) for the halo, using a Tailwind `animate-[…]` class or a local `@keyframes` block in `index.css` — no inline `style` for the animation.

## 4. Debug overlay

- [ ] 4.1 Read `new URLSearchParams(window.location.search).get("debug") === "track"` once at mount; gate all overlay logic behind this flag.
- [ ] 4.2 When enabled, `fetch("/api/track")` once per page load (module-scope cache); on success, render the returned points as an SVG `<polyline>` with `stroke-text/55 stroke-[2px] fill-none`, layered above the image and below the live trail.
- [ ] 4.3 Swallow fetch errors silently (no toast, no console.error noise beyond a one-time `console.warn`).

## 5. Wire up the layout

- [ ] 5.1 In `src/frontend/kiosk/widgets/layouts/default.ts`, replace `placeholder("map", "PLACE DE LA CARRIÈRE · NANCY")` with the imported `MapWidget`.
- [ ] 5.2 Update `placeholder.test.tsx` and any layout/registry tests that currently assert "four placeholders" or specifically check the `map` placeholder; they should now expect three placeholders (`velocity`, `weather`, `latest-events`) and the real `MapWidget` at the `map` slot.
- [ ] 5.3 Verify `no-hex-literals.test.ts` still passes against the new `widgets/map/` tree.
- [ ] 5.4 Verify `no-store-internals.test.ts` still passes (map widget reads only `useRaceState`).

## 6. Widget tests

- [ ] 6.1 `Component.test.tsx` — renders the panel header, hides the marker when `lat`/`lon` are null, renders the marker at the image centre for the georef centre, applies a `rotate(90` transform when `heading: 90`, hides the chevron when `heading: null`.
- [ ] 6.2 Trail test — feed 40 ticks through `useRaceState()`, assert the rendered `<polyline>` has exactly 30 points and they correspond to the latest 30 samples.
- [ ] 6.3 GPS-loss test — non-empty trail then `{ lat: null, lon: null }`, assert the next render has no trail polyline.
- [ ] 6.4 Debug overlay tests — `?debug=track` absent: no `fetch` call, no overlay polyline; `?debug=track` present with a mocked `/api/track` response: overlay polyline rendered with the projected points; mocked fetch failure: widget still renders without throwing, no overlay polyline.

## 7. Quality gates

- [ ] 7.1 `bun test` passes (new + existing).
- [ ] 7.2 `bun run check` is clean (Biome formatter + linter + import sort).
- [ ] 7.3 Manual run: `APP_MODE=kiosk bun run dev`, open the kiosk URL, confirm the satellite background renders, the marker pulses, and motion shows when telemetry is simulated. Repeat with `?debug=track` and confirm the GPX polyline aligns with the visible track on the image.
