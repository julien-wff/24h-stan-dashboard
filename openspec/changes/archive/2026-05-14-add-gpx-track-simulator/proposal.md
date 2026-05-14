## Why

The current simulator drives a parametric ellipse around an approximation of Place de la Carrière, so the simulated car never tracks the real racing line — sectors, heatmap dots, and lap-progress visuals all read as obviously synthetic during development and demos. We now have a real GPS trace of the loop in `scripts/track.gpx`; feeding it through the simulator gives the kiosk dashboard a faithful, lap-shaped trajectory and lets the rest of the stack (lap detection, sector splits, map rendering) be exercised against the same geometry it will see on race day. We also want the operator to be able to swap between the static NDJSON fixture and this live simulator from configuration, and to have either source resume where it left off so restarts during the 24-hour run don't visibly teleport the car back to the start line.

## What Changes

- Move the canonical track from `scripts/track.gpx` to `src/backend/kiosk/__fixtures__/track.gpx` so it sits next to the existing NDJSON sample-session fixture (`scripts/` is not a stable home for runtime inputs, and `data/` is gitignored). **BREAKING**: the file path changes.
- Replace the parametric ellipse inside `SimulatorSource` with a GPX-driven generator that parses the track file, builds a polyline with cumulative distances, and emits packets that interpolate along it at a realistic pace (target cruise speed ~15 km/h) with smooth heading and minor speed jitter.
- Loop the trajectory continuously: when the simulated car reaches the end of the polyline it wraps to the start (the recorded GPX is already a closed loop, see lines 13/163 of the current file).
- Extend the telemetry-source resolver so `KIOSK_TELEMETRY_SOURCE` accepts `"simulated"` (default), `"fixture"` (the bundled NDJSON), or `"fixture:<path>"` (an explicit NDJSON path). The default when unset remains `"simulated"`.
- Persist the active source's progress to a small JSON state file under `data/` and reload it on boot:
  - For the simulator: cumulative distance around the loop, total elapsed simulated seconds, last `seq`. Resume is keyed by the GPX file's absolute path; if the path changes (or the file is no longer recognizable), start from zero.
  - For a fixture: the file path and the index of the last consumed line. On restart, if the same fixture path is selected and the file is at least that long, resume from the next line; otherwise start from the beginning.
- Hot-reloading the GPX file at runtime is **out of scope** for this change — operators restart the kiosk to pick up edits.

## Capabilities

### New Capabilities

_None — this change extends an existing capability rather than introducing a new one._

### Modified Capabilities

- `kiosk-telemetry-ingest`: the simulator requirement changes from "parametric ellipse at ~1 Hz" to "GPX-polyline interpolation with looping and resume-on-restart at ~15 km/h"; the resolver requirement adds the `"fixture"` / `"fixture:<path>"` values; the fixture-source requirement adds resume-on-restart for the same path; a new requirement covers the GPX file location and the shared resume state file.

## Impact

- **Code**: `src/backend/kiosk/telemetry/simulator.ts` (rewrite), `src/backend/kiosk/telemetry/source.ts` (resolver branches + fixture selection), `src/backend/kiosk/telemetry/fixture.ts` (resume support), `src/backend/kiosk/boot.ts` (load/save resume state), plus a new `src/backend/kiosk/telemetry/gpx.ts` for parsing and polyline math. Tests in `src/backend/kiosk/telemetry/simulator.test.ts`, `fixture.test.ts`, and `source.test.ts` need updating.
- **Data / filesystem**: `scripts/track.gpx` moves to `src/backend/kiosk/__fixtures__/track.gpx` (git-tracked). New `data/simulator-state.json` is written during runs and is covered by the existing `data/` gitignore.
- **Configuration**: `KIOSK_TELEMETRY_SOURCE` gains `"fixture"` and `"fixture:<path>"` values; an optional `KIOSK_TRACK_PATH` env var overrides the default GPX location.
- **Dependencies**: GPX parsing is small enough to do with a regex / hand-rolled XML walk over `<trkpt>` elements; no new runtime dependency is expected.
- **No impact** on `kiosk-persistence`, the frontend, or the serial telemetry path (still unimplemented).
