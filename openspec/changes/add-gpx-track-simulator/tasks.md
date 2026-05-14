## 1. GPX parsing and polyline math

- [x] 1.1 Create `src/backend/kiosk/telemetry/gpx.ts` exporting `parseGpx(path: string): Promise<TrackPolyline>` that reads the file with `Bun.file(path).text()`, extracts `<trkpt lat="…" lon="…">` elements in document order via regex, and returns `{ points: { lat, lon, cumulativeMeters }[]; totalMeters: number }`.
- [x] 1.2 In the same module, implement haversine distance (`haversineMeters(a, b)`) used to build cumulative distances, and `bearingDegrees(a, b)` returning a value in [0, 360) — both pure functions exported for reuse and testing.
- [x] 1.3 Implement `pointAtDistance(polyline, distanceM): { lat, lon, segmentIndex }` that wraps `distanceM` modulo `totalMeters` and linearly interpolates between the two bracketing points.
- [x] 1.4 Throw at parse time with a message that includes the offending path when the file is missing, unreadable, or yields fewer than two distinct `<trkpt>` points.
- [x] 1.5 Add `src/backend/kiosk/telemetry/gpx.test.ts` covering: (a) parsing the bundled `track.gpx` produces ≥150 points with `totalMeters` > 0; (b) `pointAtDistance(0)` matches the first point; (c) `pointAtDistance(totalMeters)` wraps to the first point within 1 m; (d) haversine and bearing match hand-computed values for two known coordinate pairs; (e) missing path throws with the path in the message.

## 2. Resume state module

- [x] 2.1 Create `src/backend/kiosk/telemetry/resume-state.ts` defining the `ResumeState` discriminated union (`SimulatorState | FixtureState`) and exporting `loadResumeState(path?: string): Promise<ResumeState | undefined>` and `saveResumeState(state: ResumeState, path?: string): Promise<void>`. Default path: `data/simulator-state.json`.
- [x] 2.2 `loadResumeState` reads via `Bun.file(path).json()` inside a try/catch — missing file, empty file, or JSON parse error returns `undefined` (no throw). Shape mismatches (wrong `kind`, missing required fields) also return `undefined`.
- [x] 2.3 `saveResumeState` writes via `Bun.write(path, JSON.stringify(state))`; it creates the parent directory if missing.
- [x] 2.4 Add `src/backend/kiosk/telemetry/resume-state.test.ts` covering: round-trip simulator state, round-trip fixture state, missing file → undefined, malformed JSON → undefined, shape mismatch → undefined.

## 3. Simulator rewrite

- [x] 3.1 Rewrite `src/backend/kiosk/telemetry/simulator.ts` end-to-end. Constructor signature: `new SimulatorSource({ trackPath: string; intervalMs?: number; resume?: SimulatorState })`. Delete the ellipse constants and any orphaned helpers from the old implementation.
- [x] 3.2 In the constructor, call `parseGpx(trackPath)` synchronously via top-level `await` is not possible — instead parse lazily on the first `lines()` call and cache the polyline on the instance. If `resume?.trackPath === trackPath`, seed `distanceM`, `elapsedSec`, and `seq` from it; otherwise start from zero.
- [x] 3.3 Each tick: advance `distanceM` by `cruiseSpeedMps * (intervalMs / 1000)`; compute `speed = 15 + 1.0 * Math.sin(elapsedSec / 4)` km/h; derive lat/lon via `pointAtDistance`; compute `heading` as `bearingDegrees(prevLatLon, currentLatLon)`, falling back to the upcoming-segment bearing on the first tick after a clean start.
- [x] 3.4 Build the JSON payload with `seq`, `t = startEpochSeconds + Math.floor(elapsedSec)`, lat, lon, speed, heading, and plausible static-ish values for `hdop`, `sats`, `bat`, `cad`, `fix`, `fix3d`, `reboot`, `rssi`, `snr`. Wrap `seq` modulo 65536.
- [x] 3.5 After yielding each line, call `saveResumeState({ kind: "simulator", trackPath, distanceM, elapsedSec, seq })` — `await` it so a `stop()` immediately after still leaves a consistent file.
- [x] 3.6 Implement `stop()` so it sets the stopped flag, resolves the pending sleep promise, and is idempotent.
- [x] 3.7 Rewrite `src/backend/kiosk/telemetry/simulator.test.ts`: drop ellipse-shaped assertions; add scenarios from `specs/kiosk-telemetry-ingest/spec.md` — contract-valid output, monotonic seq, positions on polyline within 0.5 m, speed in [14, 16] km/h with mean ≈ 15, loop wrap behavior, missing GPX throws with path, resume restores when track path matches, resume ignored when track path differs, resume state file written per tick, `stop()` halts emission.

## 4. Fixture rewrite

- [x] 4.1 Update `src/backend/kiosk/telemetry/fixture.ts` so `FixtureSource` accepts `new FixtureSource({ path: string; resume?: FixtureState })`. Read the file once with `Bun.file(path).text()` and split on `\n`, keeping only non-empty lines (preserving the existing behavior).
- [x] 4.2 If `resume?.path === path` and `nonEmptyLines.length > resume.lineIndex`, start iteration at index `resume.lineIndex`; otherwise start at zero.
- [x] 4.3 After yielding each line, parse it as JSON to extract `seq` (best-effort — if parse fails, retain the previous `seq`), then `await saveResumeState({ kind: "fixture", path, lineIndex, seq })`.
- [x] 4.4 Update `src/backend/kiosk/telemetry/fixture.test.ts`: keep existing yield/order coverage, add scenarios for resume-when-path-matches, resume-ignored-when-path-differs, resume-ignored-when-file-too-short, and resume-state-written-per-line.

## 5. Resolver and boot wiring

- [x] 5.1 Update `src/backend/kiosk/telemetry/source.ts` so `resolveTelemetrySource(value: string, options?: { resume?: ResumeState }): TelemetrySource` handles: empty/unset → simulator with default `KIOSK_TRACK_PATH`; `"simulated"` → same; `"fixture"` → bundled NDJSON; `"fixture:<path>"` → `FixtureSource(<path>)`; `"fixture:"` (empty) → throw "fixture path is missing"; `/dev/…`/`tty…` → existing serial-not-implemented error; any other → existing unknown-value error.
- [x] 5.2 Read `KIOSK_TRACK_PATH` from `process.env` inside the resolver, defaulting to `src/backend/kiosk/__fixtures__/track.gpx` (resolved via `import.meta.dir` or a `path.resolve` relative to the project root — pick whichever keeps the resolver pure-ish).
- [x] 5.3 Pass `options.resume` through to the constructed source only when its `kind`/path matches; the source itself defends against mismatches, so the resolver can simply forward.
- [x] 5.4 Update `src/backend/kiosk/telemetry/source.test.ts` with one scenario per resolver branch in the spec (returns simulator for `"simulated"`, defaults on empty, returns fixture for `"fixture"`, returns fixture for `"fixture:<path>"`, throws on empty-path fixture, throws on serial, throws on unknown, ingest.ts does not import concrete sources).

## 6. Boot integration

- [x] 6.1 Update `src/backend/kiosk/boot.ts` to call `loadResumeState()` between DB open and source resolution; log a single info line summarizing the loaded state or its absence.
- [x] 6.2 Pass the loaded state via `resolveTelemetrySource(sourceName, { resume })`.
- [x] 6.3 Update `src/backend/kiosk/ingest.test.ts` (or add `boot.test.ts` if absent) covering: kiosk boots end-to-end with the simulator, non-kiosk modes are unaffected, boot does not push schema, boot tolerates a missing `data/simulator-state.json`, boot tolerates a malformed `data/simulator-state.json`.

## 7. Cleanup and verification

- [x] 7.1 Confirm `scripts/track.gpx` no longer exists in the working tree (already moved) and that no code path references the old location.
- [x] 7.2 Grep the repo for `scripts/track.gpx` and any reference to ellipse constants (`CENTER_LAT`, `CENTER_LON`, `LAT_RADIUS`, `LON_RADIUS`); remove leftovers.
- [x] 7.3 Run `bun test` until green.
- [x] 7.4 Run `bun run check` (Biome) until green.
- [ ] 7.5 Manually smoke-test: `APP_MODE=kiosk bun run src/backend/index.ts`, confirm a few packets land in `decoded_samples` with lat/lon near the GPX track, then restart and confirm the next emitted `seq` continues from the previous run.
