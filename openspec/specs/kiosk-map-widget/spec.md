# kiosk-map-widget Specification

## Purpose

Defines the real `MapWidget` that fills the `map` slot in the kiosk default layout. The widget renders the bundled satellite reference image (`track-satellite-dark.webp`) with a live vehicle marker, a short motion trail of recent samples, and an optional GPX centreline debug overlay. It projects WGS84 lat/lon into the image's natural pixel space via a pure local-tangent-plane transform (no `proj4` dependency), and reads race state exclusively through the `useRaceState()` hook. The capability also owns the `GET /api/track` backend route that exposes the loaded GPX centreline polyline as JSON, so the debug overlay can render the ideal racing line on top of the satellite image.

## Requirements

### Requirement: Map widget is registered and fills the `map` slot

A widget with `id: "map"` SHALL be exported from `src/frontend/kiosk/widgets/map/index.ts` and registered in the widget registry consumed by the kiosk default layout. The widget SHALL satisfy the `Widget` contract defined by `kiosk-widget-runtime` (an object with `id: string` and `Component: React.FC`). It SHALL replace the previous `placeholder("map", "PLACE DE LA CARRIÈRE · NANCY")` registration.

#### Scenario: Map widget is registered with the expected id
- **WHEN** the widget registry is built and queried for the widget with id `"map"`
- **THEN** the returned entry is the real `MapWidget` (not produced by the `placeholder()` factory)

#### Scenario: Default layout's `map` slot resolves to the map widget
- **WHEN** the kiosk default layout is rendered and the registry is asked for the widget at slot key `"map"`
- **THEN** the resolved widget's `Component` is the `MapWidget` component

### Requirement: Map widget renders the satellite reference image as its background

The widget's panel body SHALL display the bundled image `track-satellite-dark.webp` (imported from `@frontend/kiosk/assets/track-satellite-dark.webp`) as a non-tiled background sized to fit inside the panel without cropping. The image SHALL letterbox (preserve aspect ratio) inside the available space; the natural image is 1615×974 px.

The widget SHALL render the standard panel chrome with the title `PLACE DE LA CARRIÈRE · NANCY`. Panel body content SHALL NOT contain any other text by default (the marker, trail, and debug overlay are SVG elements, not text content).

#### Scenario: Image asset is referenced through the bundler
- **WHEN** the source file for the map widget is read
- **THEN** it contains an `import` statement resolving `track-satellite-dark.webp` from a path under `@frontend/kiosk/assets/`, and references the imported URL in a CSS `background-image` declaration (or equivalent `<img src>` attribute)

#### Scenario: Panel header reads "PLACE DE LA CARRIÈRE · NANCY"
- **WHEN** the map widget is rendered
- **THEN** the rendered output contains the text `PLACE DE LA CARRIÈRE · NANCY` in the panel header position

#### Scenario: Image preserves aspect ratio inside the panel
- **WHEN** the map widget is rendered into a container of any aspect ratio
- **THEN** the rendered background uses CSS `background-size: contain` (or an equivalent `<img>` with `object-fit: contain`) so the image is never cropped

### Requirement: Lat/lon projection produces image-pixel coordinates from a local tangent plane

A pure function `projectLatLonToImage(lat: number, lon: number): { x: number; y: number }` SHALL be exported from `src/frontend/kiosk/widgets/map/project.ts`. It SHALL convert WGS84 coordinates into pixel coordinates **in the image's natural pixel space** (origin top-left, x to the right, y downward, scale = native image pixels of `track-satellite-dark.webp`).

The projection SHALL use the georef constants:

- `CENTER = { lat: 48.69579697764976, lon: 6.181701396382847 }` (image centre in WGS84)
- `ROT = 1.1544290107700108` (radians; equal to `66.14391006458428°`)
- `SCALE = 0.3250790233479696` (metres per image pixel, applied identically on both axes)
- `IMAGE_W = 1615`, `IMAGE_H = 974` (natural image dimensions in pixels)

It SHALL convert lat/lon to local east/north metres using an equirectangular approximation at `CENTER.lat`:

- `mPerDegLat = 111_320`
- `mPerDegLon = 111_320 * cos(CENTER.lat * π / 180)`

The function SHALL NOT depend on `proj4` or any other reprojection library.

#### Scenario: Projecting the georef centre returns the image centre
- **WHEN** `projectLatLonToImage(CENTER.lat, CENTER.lon)` is called
- **THEN** the result is within 0.5 pixels of `{ x: IMAGE_W / 2, y: IMAGE_H / 2 }` on both axes

#### Scenario: Projection is invertible round-trip within tolerance
- **WHEN** a lat/lon offset by ±0.001° in each axis from `CENTER` is projected, and an analytic inverse is applied to the result
- **THEN** the recovered lat/lon matches the input within 1e-6° on each axis (this exercises the rotation+scale chain)

#### Scenario: Projection is a pure function
- **WHEN** `projectLatLonToImage` is called twice with identical arguments
- **THEN** both calls return strictly equal `{ x, y }` values, and the module has no observable side effects (no DOM access, no fetch, no console output)

### Requirement: Map widget renders a vehicle marker at the projected position

When `state.lat` and `state.lon` (read from `useRaceState()`) are both non-null finite numbers, the widget SHALL render a marker centred at the pixel returned by `projectLatLonToImage(state.lat, state.lon)`, scaled into the panel's letterboxed image area so the marker visually sits on the corresponding ground point.

The marker SHALL consist of:

- A **disc** of radius approximately 14 image-pixels (post-letterbox-scaling), styled with the Tailwind classes `fill-yellow stroke-black/60 stroke-2`. No raw hex or `rgba(...)` literals are permitted in the SVG attributes.
- A **pulse halo** child element with a CSS animation (1.2 s loop) that oscillates its opacity and scale, providing the "live" cue. Implementation MAY use SVG `<animate>` or CSS `@keyframes`; the halo's fill SHALL also use a Tailwind class (e.g. `fill-yellow/40`).
- A **directional chevron** rotated to match `state.heading` (degrees clockwise from north), styled with `fill-yellow` (no raw color literal). The chevron SHALL be hidden when `state.heading` is `null` or non-finite.

When either `state.lat` or `state.lon` is `null` (or non-finite), the marker (including the halo and chevron) SHALL NOT be rendered. The map background SHALL still be visible.

The marker SHALL be implemented inside a single `<svg>` element overlaid on the panel body at the same dimensions and position as the letterboxed image, so that the projection coordinates align with the displayed map.

#### Scenario: Marker is hidden when GPS is null
- **WHEN** `useRaceState()` returns `{ lat: null, lon: null, heading: null, … }`
- **THEN** the rendered output contains no marker disc element (the SVG overlay has no marker child) and the satellite image is still displayed

#### Scenario: Marker renders at the image centre for the georef centre
- **WHEN** `useRaceState()` returns `{ lat: 48.69579697764976, lon: 6.181701396382847, heading: 0, … }` and the panel is rendered at the image's natural aspect ratio
- **THEN** the marker disc's centre is positioned within 1% of the panel's image-area centre on both axes

#### Scenario: Chevron rotation tracks heading
- **WHEN** the widget is rendered against a state with `heading: 90`
- **THEN** the chevron element has a `transform` value containing `rotate(90` (units in degrees) applied around the marker centre

#### Scenario: Chevron is hidden when heading is null
- **WHEN** the widget is rendered against a state where `lat`/`lon` are finite but `heading` is `null`
- **THEN** the rendered output contains the marker disc but no chevron element

#### Scenario: SVG elements style colors via Tailwind utilities, not raw literals
- **WHEN** a developer greps the files under `src/frontend/kiosk/widgets/map/` for SVG attribute literals matching `fill="#`, `stroke="#`, `fill="rgb`, or `stroke="rgb`
- **THEN** no matches are found; all SVG fill/stroke styling uses Tailwind utility classes (e.g. `fill-yellow`, `stroke-yellow/40`, `fill-none`)

### Requirement: Map widget renders a short motion trail of recent samples

The widget SHALL maintain an in-memory buffer of the last 30 distinct `{ lat, lon }` samples observed via `useRaceState()` (one entry per render where `state.updatedAt` advances). The buffer SHALL be rendered as a single SVG `<polyline>` whose `points` attribute is the projection of each buffered sample into the image's pixel space, in chronological order. The polyline SHALL be styled with the Tailwind classes `stroke-yellow/40 stroke-[3px] fill-none` (no raw hex or `rgba(...)` in SVG attributes), and SHALL render **behind** the marker disc.

The buffer SHALL be reset to empty when `state.lat` or `state.lon` become `null` (loss of fix). The buffer SHALL NOT persist across component unmounts (a remount starts empty).

#### Scenario: Trail polyline reflects buffered samples
- **WHEN** the widget has observed 5 successive ticks with distinct `(lat, lon)` values
- **THEN** the rendered SVG contains a `<polyline>` element whose `points` attribute lists exactly 5 projected coordinate pairs in chronological order

#### Scenario: Trail is capped at 30 samples
- **WHEN** the widget has observed 40 successive ticks with distinct `(lat, lon)` values
- **THEN** the rendered `<polyline>` has exactly 30 coordinate pairs and they correspond to the most recent 30 samples

#### Scenario: Trail clears on GPS loss
- **WHEN** the widget has a non-empty trail and then `useRaceState()` returns `{ lat: null, lon: null, … }`
- **THEN** the next render contains no `<polyline>` trail element (or a polyline with zero points)

### Requirement: Map widget reads race state only via `useRaceState()`

The map widget SHALL access race state exclusively through the `useRaceState()` hook from `@frontend/kiosk/state/store`. It SHALL NOT:

- Import the store internals (`getSnapshot`, `subscribe`, `dispatch`, `setConnection`, `resetState`, the mutable `state` binding) directly.
- Import or open a WebSocket, or any other I/O primitive, **other than** the single `fetch("/api/track")` call used for the debug overlay (which is gated by the debug flag).
- Read from `RaceUpdate` types or any backend type.

#### Scenario: Map widget does not import store internals
- **WHEN** a developer greps the files under `src/frontend/kiosk/widgets/map/` for `from "@frontend/kiosk/state/store"`
- **THEN** every match imports only the symbol `useRaceState` (and possibly the `RaceState` type), and no file imports `getSnapshot`, `subscribe`, `dispatch`, `setConnection`, or `resetState`

#### Scenario: Map widget performs no I/O other than the gated track fetch
- **WHEN** a developer greps the files under `src/frontend/kiosk/widgets/map/` for `WebSocket`, the `ws-client` module, or `fetch(`
- **THEN** the only match is the `fetch("/api/track")` call inside the debug-overlay branch, and there is no other `fetch` or any `WebSocket` reference

### Requirement: Debug overlay renders the GPX centreline polyline when enabled

The widget SHALL support a debug overlay that, when enabled, renders the GPX track centreline as an SVG `<polyline>` overlaid on the map. The overlay SHALL be enabled when the page URL contains the query parameter `debug=track` (i.e. `new URLSearchParams(window.location.search).get("debug") === "track"`). The overlay SHALL be disabled (and not fetched) otherwise.

When enabled, the widget SHALL `fetch("/api/track")` exactly once per page load and project each returned `{ lat, lon }` point through `projectLatLonToImage`. The polyline SHALL be styled with the Tailwind classes `stroke-text/55 stroke-[2px] fill-none` (no raw hex or `rgba(...)` in SVG attributes), and SHALL render **above** the satellite image but **below** the live trail and marker, so the live position is never visually occluded.

If the fetch fails (network error, non-2xx response, or empty `points` array), the overlay SHALL silently not render; no user-visible error is shown. The fetch result MAY be cached in module scope so re-mounts within the same page load do not refetch.

#### Scenario: Overlay is hidden by default
- **WHEN** the map widget is rendered on a page whose URL has no `debug` query parameter
- **THEN** the rendered output contains no GPX-overlay polyline element, and no `fetch` call to `/api/track` has been made

#### Scenario: Overlay renders when `?debug=track` is present
- **WHEN** the map widget is rendered on a page whose URL is `…?debug=track` and the `/api/track` endpoint returns a polyline of N≥2 points
- **THEN** the rendered output contains a GPX-overlay SVG `<polyline>` whose `points` attribute lists N projected coordinate pairs in order

#### Scenario: Overlay fetch failure does not break the widget
- **WHEN** `?debug=track` is set but `/api/track` returns a 404 or a network error
- **THEN** the widget still renders the satellite background and the live marker without throwing, and contains no GPX-overlay polyline element

### Requirement: Kiosk backend exposes the GPX polyline via `GET /api/track`

When the kiosk backend is running (`APP_MODE === "kiosk"` and `bootKiosk()` has produced a `kioskHandle`), the HTTP server SHALL register a route `GET /api/track` that returns a JSON document:

```ts
{ points: Array<{ lat: number; lon: number }>, totalMeters: number }
```

The `points` array SHALL be derived from the polyline already held on `kioskHandle.centerline` (loaded once at boot via `loadCenterline`); per-request re-parsing of the GPX file is NOT permitted. The response SHALL set `Content-Type: application/json`. The `totalMeters` field SHALL equal `kioskHandle.centerline.totalMeters`.

When `APP_MODE !== "kiosk"` (no `kioskHandle` available), the route SHALL NOT be registered; the server SHALL return its default 404 for `GET /api/track`.

#### Scenario: Route returns the loaded centreline as JSON
- **WHEN** the kiosk backend is running and a GET request is made to `/api/track`
- **THEN** the response status is 200, the `Content-Type` header is `application/json`, and the parsed body has shape `{ points: Array<{ lat: number; lon: number }>, totalMeters: number }` with `points.length >= 2`

#### Scenario: Route reuses the cached centreline
- **WHEN** two successive GET requests are made to `/api/track`
- **THEN** the GPX file on disk is read at most once for the lifetime of the process (i.e. the second request does not call `parseGpx`)

#### Scenario: Route is absent in server-only mode
- **WHEN** the backend is booted with `APP_MODE` unset or `"server"` and a GET request is made to `/api/track`
- **THEN** the response status is 404
