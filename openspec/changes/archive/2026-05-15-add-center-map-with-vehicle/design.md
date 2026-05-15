## Context

The kiosk dashboard's centre column currently shows a `PLACE DE LA CARRIÈRE · NANCY` placeholder. The README designates the map as the **hero** of the layout — the second visual anchor a passer-by should read after the speed numeral. This change wires the real widget: a stylised satellite image (`track-satellite-dark.webp`) with a live vehicle marker driven by `useRaceState()`, plus a debug overlay that draws the parsed GPX centreline on top so the team can sanity-check both the georef and live GPS during the race.

The frontend already has the inputs it needs: `state.lat`, `state.lon`, `state.heading` are populated by the existing `tick` event reducer. The backend already parses the GPX into a `TrackPolyline` (`parseGpx` in `src/backend/kiosk/telemetry/gpx.ts`) and holds it in memory via `loadCenterline`. So this change is mostly frontend work: a projection module, a widget, an SVG overlay, and one new HTTP route to expose the polyline.

The georef supplied by the user describes an affine relationship between **ground coordinates** and **image pixels**:

```
imageCenter: [688143.85, 6223401.26]   // EPSG:2154 (Lambert-93) metres
imageRotate: 1.1544 rad   (66.14°)     // rotation applied to align track with image axes
imageScale:  [0.3251, 0.3251]          // metres per pixel (assumed; validated by debug overlay)
center:      [6.181701, 48.695797]     // WGS84 lon/lat of imageCenter, for reference
```

The image is 1615×974 px; the place is ~250 m long. At 0.325 m/px that's a 525×316 m ground footprint — comfortably wider than the track itself and consistent with the visible framing (buildings + Pépinière park around the place). The debug GPX overlay is the canonical way to confirm this; if either the rotation sign or scale orientation is inverted, the GPX polyline will visibly fall off the track and we adjust a single transform constant.

## Goals / Non-Goals

**Goals:**
- Real `MapWidget` registered for the `map` slot, replacing the placeholder.
- Live vehicle marker projected onto the image at the correct pixel, oriented by `state.heading`, with a brief motion trail.
- Theme-consistent abstract marker: yellow disc + directional chevron, pulsing while motion data is fresh.
- Pure-frontend projection (no `proj4` or other geo dependency); math testable in `bun test`.
- Debug overlay that renders the GPX centreline polyline on top of the image when enabled, fetched once from `GET /api/track`.
- Graceful degradation when `lat`/`lon`/`heading` are `null`.
- Keep `useRaceState()` as the only race-data interface for the widget (per `kiosk-widget-runtime` rules).

**Non-Goals:**
- Sector pucks, dashed centre-line, heatmap dots, compass, scale bar, vignette — all listed in README §2 Map but deferred to a follow-up change.
- Re-projecting GPS server-side or storing image-pixel coordinates in the DB. Projection stays a render-time concern.
- Map panning / zooming / interactivity. The image is fixed-size, fitted to the panel.
- Replacing the existing centreline `s`-progress calculation. The backend still owns `state.s` and `state.sector`; the widget only renders raw position.

## Decisions

### D1. Project in a local tangent plane, not via Lambert-93

**Choice:** Convert WGS84 `lat`/`lon` into local east/north metres around the supplied `center`, then apply `imageRotate` + `imageScale` to produce image pixels. Do not import `proj4` or do a true Lambert-93 forward projection.

**Why:** The track is ~250 m across. At that scale the difference between Lambert-93 and a local equirectangular projection centred on the image is well under a centimetre — invisible at 0.325 m/pixel. Adding `proj4` (or any reprojection lib) is ~50 KB and an unnecessary dependency for a closed-form 4-line transform. The `imageCenter` Lambert-93 numbers in the georef are effectively just an offset; the **affine** part (rotation + scale) is what matters and is identical in any locally-flat metric frame at this size.

**Transform:**

```ts
// constants from georef (frontend module)
const CENTER = { lat: 48.69579697764976, lon: 6.181701396382847 };
const ROT = 1.1544290107700108;          // radians
const SCALE = 0.3250790233479696;        // metres per pixel
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos(CENTER.lat * Math.PI / 180);

// world (metres east/north of CENTER) → image pixels (origin at image centre, y-down)
function project(lat: number, lon: number, w: number, h: number) {
  const east  = (lon - CENTER.lon) * M_PER_DEG_LON;
  const north = (lat - CENTER.lat) * M_PER_DEG_LAT;
  const c = Math.cos(ROT), s = Math.sin(ROT);
  const xRot =  c * east + s * north;
  const yRot = -s * east + c * north;
  // image y grows downward; world north grows upward → flip y
  return { x: w / 2 + xRot / SCALE, y: h / 2 - yRot / SCALE };
}
```

The rotation sign and the y-flip are the two ambiguous bits. They are determined empirically using the GPX overlay: if the polyline lands rotated 180°, flip ROT; if it lands mirrored, flip the y-flip. This is a one-line correction discovered by visual inspection during development. The unit tests pin the resolved transform once it's calibrated.

**Alternatives considered:**
- Full `proj4` reprojection through EPSG:2154 — overkill, adds dependency, no measurable accuracy gain at 250 m.
- Server-side projection (compute pixel coords in the backend, ship them with each tick) — couples wire protocol to a UI concern; widget should be self-sufficient given lat/lon.

### D2. Render with SVG, not Canvas

**Choice:** The widget is a `<div>` with the satellite image as a CSS `background-image`, overlaid by a single `<svg>` element that hosts the marker, the trail polyline, and (when enabled) the GPX polyline.

**Why:** ~1 Hz update rate, ≤120 trail points, ≤170 GPX points — SVG handles this trivially with declarative React rendering, no manual `requestAnimationFrame`, no resize observers, no bitmap re-rasterisation. CSS handles the pulse animation (`@keyframes`) on the marker disc. Canvas would only matter if we were drawing thousands of moving primitives.

**Alternatives considered:**
- HTML5 Canvas — needs explicit DPR handling, redraw on resize, more code for an effect we can get from CSS. No benefit at this fidelity.
- `<img>` element for the map — works equally well; CSS `background` chosen because it lets us use `background-size: contain` and keep the SVG overlay at `100%×100%` of the panel without measuring the rendered image.

### D3. Marker visual — yellow disc + chevron + 30 s trail

**Choice:**
- **Disc**: 14 px radius, fill `var(--color-yellow)` (`#fbe216`), stroke `rgba(0,0,0,0.6)` 2 px, with a CSS pulse animation (1.2 s loop, `opacity` 1 ↔ 0.6 and scale 1 ↔ 1.15 on a child halo element).
- **Chevron**: an inward-pointing yellow `<polygon>` rotated by `state.heading` (rotated around the disc centre). Hidden when `heading` is `null`.
- **Trail**: an SVG `<polyline>` of the last 30 projected sample positions (one per tick at ~1 Hz), `stroke="rgba(251,226,22,0.35)"`, `stroke-width="3"`, `fill="none"`. Buffer kept in `useRef` to avoid re-render churn; the polyline `points` attribute is recomputed only on tick.

**Why:** Matches the README's "pulsing yellow dot with car number, oriented by GPS heading". The car number is omitted from the marker in v1 — `42` would shrink the disc to noise at the panel's effective resolution. The trail is the cheapest way to communicate "this is the live car, not a static label".

**Alternatives considered:**
- F1-style numbered tag (`42` inside the disc) — kept on the README roadmap but deferred; the topbar already shows the car number prominently.
- Showing the full lap heatmap right away — that's a separate widget concern and depends on `state.heatmap`, which is empty in early ticks.

### D4. Expose the GPX polyline via `GET /api/track`

**Choice:** Add a single GET route to the kiosk Bun server returning the parsed polyline as JSON: `{ points: Array<{ lat: number; lon: number }>, totalMeters: number }`. The handler reuses the polyline already held on `kioskHandle.centerline` (from `loadCenterline` in `boot.ts`) — no re-parse on each request.

**Why:** The GPX file lives in the backend tree (`src/backend/kiosk/__fixtures__/track.gpx`) and is already loaded at boot. Re-parsing on the client would duplicate logic and require bundling the GPX as a static asset. A single HTTP GET is cheap, cacheable, and keeps the source of truth on the backend.

The route is only registered when `APP_MODE === "kiosk"` (the existing pattern in `src/backend/index.ts`). In `server`-only mode it's not available — the debug overlay then no-ops with a warning logged once.

**Alternatives considered:**
- Push the polyline as a `track` event on WebSocket connect — needlessly inflates the event vocabulary and forces every client to receive it even when debug is off.
- Bundle the GPX file as a frontend asset and parse in the browser — duplicates `parseGpx`, ships ~5 KB of GPX XML to every visitor.

### D5. Debug overlay toggle via query param + DebugPage

**Choice:** The overlay is hidden by default. It is enabled by either of:
1. Appending `?debug=track` to the kiosk URL (read via `URLSearchParams` at widget mount; no re-read on history changes — race kiosk doesn't navigate).
2. Visiting the existing `DebugPage` route, which sets the same flag via context so the map widget — if mounted there — renders the overlay too.

When enabled, the widget fetches `/api/track` once on mount; the response is cached in module scope so re-mounts don't refetch. Failures fall through silently (overlay just doesn't appear) — this is debug UI, not user-facing.

**Why:** Zero risk of leaking debug chrome onto the race-day kiosk. Trivial to enable for a single browser tab while validating georef. No build-time flag, so QA can toggle in production.

**Alternatives considered:**
- Always-on overlay at low opacity — distracting on the hero panel during race; defeats the "second visual anchor" goal.
- Keyboard shortcut — kiosk has no keyboard; URL param is easier to set via a bookmark or a remote SSH session that opens Chromium.

### D6. Asset bundling

**Choice:** Move `track-satellite-dark.webp` from the repo root into `src/frontend/kiosk/assets/`, then `import mapImg from "@frontend/kiosk/assets/track-satellite-dark.webp"` — Bun's HTML import pipeline returns a hashed URL. The image is referenced as `background-image: url(${mapImg})`.

**Why:** Repo-root assets aren't on any bundler's path and can't be safely served. Bun's frontend bundler natively handles `.webp` imports; no plugin needed. Hashed filenames give us cache-busting for free when the image is ever updated.

## Risks / Trade-offs

- **[Risk] Rotation sign / y-flip wrong on first pass.** → **Mitigation:** the GPX debug overlay is shipped in the same change. Calibration is a one-line edit and the unit test pinning the transform is added once visually validated. Sub-pixel accuracy is not required — the marker is 14 px wide on a map where one pixel is ~0.33 m.
- **[Risk] `state.lat`/`state.lon` lag the actual position by up to one second (1 Hz ticks).** → **Mitigation:** acceptable for the race-day read; the trail gives temporal context. If smoother motion is wanted later, interpolate between the last two samples using `requestAnimationFrame` — additive change, no API impact.
- **[Risk] Image aspect ratio (1615×974 ≈ 1.66) does not match the centre panel slot's aspect.** → **Mitigation:** `background-size: contain` letterboxes the image inside the panel; the SVG overlay scales with the displayed image because it uses the same panel-relative `0..1` projection (we project to image-natural pixels then transform via the panel's measured letterbox offset on resize via `ResizeObserver`). Detail in the implementation; spec just asserts the marker visibly tracks the GPX line.
- **[Risk] GPX polyline file changes without the image being re-georeferenced.** → **Mitigation:** the polyline is the **source of truth** for the centreline; the image is decorative. If they diverge, the debug overlay surfaces it immediately. Treat the image as a versioned asset; replacing it requires re-running `gpx.studio`'s overlay calibration.
- **[Trade-off] Local-plane projection rather than true Lambert-93.** → Accuracy within the 250 m frame is sub-centimetre; we accept the (theoretical) loss of correctness in exchange for zero dependencies.
- **[Trade-off] Trail kept client-side only.** → If a client refreshes mid-race the trail starts empty until ~30 ticks arrive. Acceptable; the marker itself is correct from frame 1.

## Migration Plan

1. Move `track-satellite-dark.webp` from `/` to `src/frontend/kiosk/assets/`. Update `.gitignore` if needed (probably not). Single commit so git history follows the rename.
2. Add `GET /api/track` route to `src/backend/index.ts` (only when `kioskHandle` is set). Smoke test via `curl`.
3. Implement `src/frontend/kiosk/widgets/map/project.ts` + unit tests. Calibrate against the GPX polyline using the debug overlay.
4. Implement `MapWidget` component with marker, trail, and overlay. Register in `default.ts` in place of `placeholder("map", …)`.
5. Update layout / placeholder tests to expect three placeholders, not four.
6. Run `bun test` and `bun run check`.

**Rollback:** revert the layout registration; the `placeholder("map", …)` line is the only entry point. The new files are dead code if not registered.

## Open Questions

- **Trail length & decay**: 30 samples at 1 Hz feels right for "the car is moving here"; longer (e.g. one full lap) might also be interesting. Deferred until we see it on the kiosk.
- **Car-number badge on the marker**: README mentions `42` inside the disc. Skipped in v1 for legibility at panel scale; revisit if the marker reads as ambiguous from across the room.
- **Behaviour when GPS lost (`state.lat === null` mid-race)**: should the last known marker linger (dimmed) for N seconds, or disappear instantly? Current decision: disappear. Will reconsider after the first real telemetry session.
