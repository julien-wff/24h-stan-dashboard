## Why

The kiosk dashboard's centre slot is currently a placeholder titled `PLACE DE LA CARRIÈRE · NANCY`. The map is described in the README as the **hero** of the layout — the second visual anchor that answers "where is the car right now?" from across the room. Without it, the dashboard loses its single most distinctive feature relative to a generic F1-style timing screen. We now have the satellite reference image (`track-satellite-dark.webp`) and the georeferencing parameters needed to project live GPS samples onto it, so this is the moment to wire the real widget.

## What Changes

- Move `track-satellite-dark.webp` from the repo root into `src/frontend/kiosk/assets/` and import it through the Bun bundler so it ships with the frontend.
- Replace the `map` placeholder widget with a real `MapWidget` that renders the satellite image as the panel background and overlays a vehicle marker.
- Add a small projection module (`projectLatLonToImage`) that converts WGS84 `lat`/`lon` into pixel coordinates over the image, using the supplied georef (image centre in EPSG:2154, scale, rotation). The frontend already has access to `state.lat`/`state.lon`/`state.heading` via `useRaceState()` — no backend changes required.
- Render a theme-consistent abstract vehicle marker: a pulsing yellow disc (`#fbe216`) with a directional chevron rotated by `state.heading`, dropped from the design's existing yellow/black palette. Includes a dimmer "trail" of the last ~30 s of samples so the marker reads as motion, not a static pin.
- Gracefully degrade: when `lat`/`lon` are `null` the marker is hidden and the panel shows the map only; when `heading` is `null` the marker renders without rotation.
- **Debug overlay**: render the parsed GPX polyline (`src/backend/kiosk/__fixtures__/track.gpx`, already loaded by the backend via `parseGpx`) on top of the satellite image, toggleable at runtime. The polyline is exposed to the frontend through a small HTTP route (`GET /api/track`) returning `{ points: Array<{ lat, lon }> }`. The overlay is opt-in: hidden by default, enabled by appending `?debug=track` to the kiosk URL (or via the existing `DebugPage`). Useful both for verifying the georef and for sanity-checking GPS calibration during the race.
- Remove the four-placeholder requirement from `kiosk-dashboard-layout` so it only covers `velocity`, `weather`, `latest-events`, and add a new requirement that points to the `kiosk-map-widget` capability for the `map` slot.

Out of scope (deferred):
- Sector pucks, dashed centre line, heatmap dots, compass, scale bar, vignette (all listed in README §2 Map). This change introduces only the base map + live vehicle marker; the decorative chrome lands in a follow-up.
- Server-side track-centerline projection (`s`, sectors) — already produced by the backend; this change only **renders** position, it does not compute progress.

## Capabilities

### New Capabilities
- `kiosk-map-widget`: Renders the Place de la Carrière satellite reference image with a live, georeferenced vehicle marker driven by `useRaceState()`. Owns the lat/lon → image-pixel projection and the marker's visual treatment.

### Modified Capabilities
- `kiosk-dashboard-layout`: The "Placeholder widgets occupy the remaining slots" requirement drops `map` from the placeholder list (now three placeholders: `velocity`, `weather`, `latest-events`). A new requirement records that the `map` slot is filled by the real widget defined in `kiosk-map-widget`. Slot wiring (`slots["map"] === "map"`) and the default layout grid are unchanged.

## Impact

- **Code**:
  - New: `src/frontend/kiosk/widgets/map/` (component, projection module, GPX overlay, tests).
  - New: `src/frontend/kiosk/assets/track-satellite-dark.webp` (moved from repo root).
  - New: `GET /api/track` route on the kiosk Bun server that returns the parsed GPX polyline as JSON. Reuses the existing `parseGpx` from `src/backend/kiosk/telemetry/gpx.ts`, served from the same cached polyline the centerline module already loads.
  - Modified: `src/frontend/kiosk/widgets/layouts/default.ts` — registers the real `MapWidget` instead of `placeholder("map", …)`.
  - Modified: `src/frontend/kiosk/widgets/placeholder.test.tsx` and the layout/registry tests that currently assert `map` is a placeholder.
- **Specs**:
  - New: `openspec/specs/kiosk-map-widget/spec.md`.
  - Delta: `openspec/changes/add-center-map-with-vehicle/specs/kiosk-dashboard-layout/` adjusts the placeholder requirement.
- **APIs / wire protocol**: none. The widget consumes `state.lat`, `state.lon`, `state.heading` which already exist on `RaceState` and are populated by `tick` events.
- **Dependencies**: none. Projection is plain TypeScript (cos/sin transform). Image is bundled by Bun's built-in asset handling.
- **Performance**: marker re-renders at the tick rate (~1 Hz). Trail is a fixed-size sample buffer kept in widget state — no observable cost on the 1920×1080 kiosk.
- **Risk**: the georef parameters are trusted as given. If they prove off, calibration is a one-line tweak to the projection module — image and DOM are decoupled.
