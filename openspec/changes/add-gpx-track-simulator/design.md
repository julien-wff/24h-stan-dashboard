## Context

`SimulatorSource` today emits packets along a parametric ellipse centered on Place de la Carrière. That works to exercise the ingest pipeline but is not faithful enough to drive the kiosk's lap detection, sector splits, or stylized satellite map — the simulated trajectory does not match the racing line at all. We have a real GPS trace of the loop (currently at `scripts/track.gpx`, 154 `<trkpt>` elements over one closed lap) and want the simulator to use it.

Two related concerns ride along:
- The operator should be able to pick between the live simulator and a recorded NDJSON fixture without touching code (`KIOSK_TELEMETRY_SOURCE` already exists; we extend the value space).
- The 24h-de-Stan kiosk is restarted occasionally. Both source kinds should resume where they left off so the dashboard does not visibly teleport the car back to the start line.

Constraints:
- Runtime is Bun on a Raspberry Pi. Prefer Bun APIs (`Bun.file`, `Bun.write`) over `node:fs`. No new runtime dependencies.
- The telemetry source contract (`AsyncIterable<string>` of newline-delimited JSON) MUST NOT change — the ingest loop already consumes only that interface.
- Persisted state lives under `data/`, which is gitignored.

## Goals / Non-Goals

**Goals:**
- Drive the simulator from a real GPX track so the car visibly follows the racing line.
- Keep the simulator pace realistic: target cruise speed ~15 km/h with small smooth jitter.
- Loop the trajectory indefinitely.
- Allow the operator to select either the simulator or a fixture via env var; simulator is the default.
- Resume across restarts for both source kinds, keyed by the active input file's identity.
- Stay within Bun-native APIs and avoid new dependencies.

**Non-Goals:**
- Hot-reloading the GPX file at runtime. Operators restart the kiosk to pick up edits.
- Full map-matching, smoothing, or de-noising of the recorded track. The recorded points already form a clean loop; we treat them as the ground-truth polyline.
- Simulating sensor failures, packet loss, or LoRa link degradation. The simulator continues to emit clean packets.
- Multi-lap memory or persisting lap history. Resume only captures progress around the current loop.
- Changing the `TelemetryPacket` JSON contract.

## Decisions

### Decision: Store the GPX inside `__fixtures__`, not under `data/` or `scripts/`

The track is a stable input that must be checked into git so a fresh clone can run the simulator. `data/` is gitignored (it holds the SQLite DB and the new resume-state file). `scripts/` is for executable utilities, not runtime inputs. We co-locate the GPX with the existing NDJSON fixture at `src/backend/kiosk/__fixtures__/track.gpx`.

**Alternative considered:** a top-level `assets/` folder. Rejected — adds a new top-level directory for a single file; the `__fixtures__` location already signals "deterministic input consumed by the kiosk backend."

### Decision: Hand-rolled XML parsing via regex over `<trkpt>` elements

The GPX file is shallow: one `<trk>`, one `<trkseg>`, a flat list of `<trkpt lat="…" lon="…">` (elevation is unused). A small regex over the file text — read once via `Bun.file(path).text()` — extracts the points in order. No XML library is added.

**Alternative considered:** `fast-xml-parser` or a DOM-based parser. Rejected — pulls in a runtime dependency for what is effectively `/<trkpt\s+lat="([\d.\-]+)"\s+lon="([\d.\-]+)"/g`.

### Decision: Pre-compute a polyline with cumulative distances at construction time

The simulator parses the GPX once when it starts (and once more if the resume-state file references a different path). It produces an array of `{ lat, lon, cumulativeMeters }` and a `totalMeters` value. Inter-point distance uses the haversine formula on the WGS-84 sphere with `R = 6_371_000` m; the Place de la Carrière loop is ~600 m so flat-earth approximations would also work, but haversine is one short function and dimensionless against the track length.

### Decision: Constant cruise speed with smooth jitter, derived heading

Cruise speed: 15 km/h ≈ 4.17 m/s. The simulator advances cumulative distance by `speed_mps * dt` each tick, then interpolates lat/lon between the two surrounding polyline points. Speed jitter: `15 + 1.0 * sin(t / 4)` km/h — a slow sinusoid so the speed readout on the kiosk moves naturally without ever looking glitchy. Heading is the bearing from the previous emitted point to the current one (or, for the first tick after a restart, the bearing of the upcoming polyline segment). This keeps heading consistent with motion direction and reverses correctly when the loop wraps.

**Alternative considered:** per-segment speed profile (slow in corners, fast on straights). Rejected for this change — adds tuning surface and the kiosk does not yet have a "expected corner speed" feature to validate against. The constant-with-jitter model is enough to make the map look alive.

### Decision: Tick interval stays at 1 Hz to preserve the existing contract

`runIngest`'s persistence layer is sized for one packet per second. Internally the simulator could interpolate at a higher rate, but it only yields one line per `setTimeout(1000)` tick. Distance advances by `speed_mps * 1` each tick.

### Decision: Single resume-state file at `data/simulator-state.json`, discriminated by source kind

Both the simulator and the fixture write to the same file via `Bun.write`. Shape:

```ts
type SimulatorState = { kind: "simulator"; trackPath: string; distanceM: number; elapsedSec: number; seq: number };
type FixtureState   = { kind: "fixture";   path: string;       lineIndex: number;                       seq: number };
type ResumeState    = SimulatorState | FixtureState;
```

On boot, `bootKiosk` reads the file (`Bun.file(path).json()` inside a try/catch — missing or malformed file → undefined → start from zero) and passes the parsed value to whichever source the resolver returned. Each source decides whether the state applies (by comparing `kind` and the path/track-path) and silently restarts from zero on mismatch.

State writes happen from inside the source on every emitted tick (the cost is one `Bun.write` of <200 bytes per second, which is well under what the SQLite ingest already pays). No debouncing — keeping the file fresh means a hard reboot loses at most one second of progress.

**Alternative considered:** separate state files per source kind. Rejected — adds bookkeeping and surprises operators who switch sources expecting clean state.

**Alternative considered:** persist resume state in SQLite alongside ingest. Rejected — the resume state belongs to the *source*, not the *ingest output*; sources currently know nothing about the DB and we don't want to leak that dependency.

### Decision: Resume identity is the file path, not a content hash

If the operator edits `track.gpx` and the polyline geometry changes, resuming at the same cumulative distance will land somewhere different on the loop. We accept that — operators who edit the track should expect a one-time jump. Hashing the file to detect "same path, different content" is more machinery than this change needs.

For fixtures, resume requires both the same path *and* the file being at least `lineIndex + 1` lines long. Truncated fixtures restart cleanly.

### Decision: Resolver value space extends with `"fixture"` and `"fixture:<path>"`

- `"simulated"` (or unset) → GPX-driven `SimulatorSource`. Default.
- `"fixture"` → `FixtureSource` against the bundled `src/backend/kiosk/__fixtures__/sample-session.ndjson`.
- `"fixture:/abs/path.ndjson"` → `FixtureSource` against the given path. Empty / whitespace path → error.
- Strings starting with `/dev/` or `tty` continue to throw the existing "not yet implemented" error.
- Anything else continues to throw "unknown value".

The resolver is the only place that interprets the env var; the ingest loop is unchanged.

## Risks / Trade-offs

- **[Risk]** Per-tick state writes increase filesystem traffic on the Pi (~1 write/s, ~86 400/day). **Mitigation**: the file is ~200 bytes and the Pi's SD card already absorbs SQLite WAL writes at higher cadence; we revisit only if storage telemetry shows wear concerns.
- **[Risk]** The GPX is ~150 points; rapid sub-second interpolation could produce visible "snap" between segments. **Mitigation**: at 1 Hz and ~4 m/tick, each segment (~4 m on average around a ~600 m loop) takes roughly one tick — linear interpolation is fine.
- **[Risk]** Heading derived from successive emitted positions will be undefined for the very first tick after a clean start (no previous point). **Mitigation**: seed it with the bearing of the upcoming polyline segment so the kiosk never sees a null heading.
- **[Risk]** Resume across a GPX edit places the car at a non-corresponding lat/lon. **Mitigation**: documented; operators who edit the track accept the one-tick jump.
- **[Trade-off]** Constant-cruise speed model under-uses the recorded data (real GPS speed varies). We chose simplicity now and can layer per-segment speed later without changing the source interface.

## Migration Plan

1. The GPX file has already been moved from `scripts/track.gpx` to `src/backend/kiosk/__fixtures__/track.gpx` (`mv` on disk, picked up by the same commit as the simulator rewrite).
2. Rewrite `src/backend/kiosk/telemetry/simulator.ts` end-to-end — the parametric-ellipse implementation is fully replaced, not extended. Delete any constants or helpers it leaves orphaned.
3. Rewrite `src/backend/kiosk/telemetry/fixture.ts` to accept the optional `resume` argument and the per-tick state write. Update `source.ts` so the resolver branches and signature match the new spec.
4. Update or rewrite the corresponding tests (`simulator.test.ts`, `fixture.test.ts`, `source.test.ts`) to cover the new requirements; remove obsolete cases that asserted ellipse-shaped output.
5. `bootKiosk` tolerates a missing or stale `data/simulator-state.json` (try/catch around `Bun.file(...).json()`), so deployments that come up without the file just start from zero.
6. Run `bun test` and `bun run check` until clean.
