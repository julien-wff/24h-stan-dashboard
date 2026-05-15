## Context

Today the kiosk's ingest loop validates packets and writes them to `raw_packets` + `decoded_samples`. Nothing downstream observes the stream — there are no derived race facts and no hook for future broadcasters or forwarders to subscribe to. The follow-up work (TV WebSocket, server forwarder, alert engine) all needs the same primitive: "something happened in the race, here it is, typed." This change introduces that primitive, with lap detection as the first and only producer for now.

Lap detection is the right starter detector because it forces every cross-cutting decision the bus will need long-term: a stable typed-event contract, projection of raw GPS to track-relative coordinates, transactional persistence of a derived fact, and clean wiring from `runIngest`'s existing `onSample` callback. Pit and alert detectors can plug in later without re-architecting any of that.

Constraints inherited from the codebase: Bun + Drizzle + SQLite, `KIOSK_TRACK_PATH` already exists and points at the same GPX the simulator uses, `runIngest` already accepts an `onSample` callback so no ingest changes are needed.

## Goals / Non-Goals

**Goals:**
- Provide a type-safe, in-process event bus the rest of the platform will subscribe to.
- Detect lap completion from the live decoded-sample stream and persist it to a new `laps` table with per-sector splits.
- Keep the lap detector resilient to GPS jitter and to a reboot mid-race (without trying to *recover* in-progress lap state — see Non-Goals).
- Make the bus surface trivially extensible so adding `pit` / `alert` detectors later is purely additive.

**Non-Goals:**
- WebSocket broadcast of the events (covered by `add-kiosk-ws-broadcast`).
- Pi → Server forwarding (`add-kiosk-forwarder`).
- Pit / alert detectors (future changes against the same bus).
- Persisting `is_best_lap` / `is_best_sector` flags — derived on read via `MIN()`.
- Resuming an in-progress lap across kiosk reboot. After a reboot, the lap *in progress at the time of the crash* is discarded; the next completed crossing-to-crossing interval becomes a new lap.
- Surveyed sector boundaries — interim values are used; real ones land in a follow-up change once the track is measured.

## Decisions

### 1. Type-safe bus: a generic subclass of `node:events` `EventEmitter`

Node's `EventEmitter` (available in Bun via `node:events`) is the standard event primitive in this runtime. It provides niceties we want for free — `once`, `removeAllListeners`, `setMaxListeners` (listener-leak warnings), `listenerCount`, `eventNames` — but is untyped at the call site: `emitter.emit('foo', anything)` and `emitter.on('foo', (anything) => …)` both accept `any`.

We get both properties by **subclassing** EventEmitter with a generic `EventMap` and narrowing the four hot methods (`on`, `once`, `off`, `emit`):

```ts
import { EventEmitter } from "node:events";

export type RaceEventMap = { lap: LapEvent /* future: pit, alert, … */ };

export class TypedEventBus<M extends Record<string, unknown>> extends EventEmitter {
  override on<K extends keyof M & string>(event: K, listener: (payload: M[K]) => void): this { … }
  override once<K extends keyof M & string>(event: K, listener: (payload: M[K]) => void): this { … }
  override off<K extends keyof M & string>(event: K, listener: (payload: M[K]) => void): this { … }
  override emit<K extends keyof M & string>(event: K, payload: M[K]): boolean { /* per-listener try/catch */ }
}
```

`emit` is also overridden to wrap each listener call in `try/catch` and log exceptions, so one bad subscriber cannot abort fan-out to the rest. (Node's default `emit` is synchronous and rethrows the first listener exception, which is wrong for ingest's hot path — a buggy handler would crash the very caller of the detector, i.e. ingest itself.)

`on()` keeps the standard chainable `this` return type. Subscribers unsubscribe via `bus.off(event, listener)`; given that handlers in the kiosk are boot-scoped and long-lived, the standard EventEmitter idiom is fine and we don't need to invent a `subscribe()` helper that returns a closure.

We do **not** name any event `error`. EventEmitter's special-cases the `error` event (it throws if no listener is registered), which is fine for native streams but a footgun for a domain bus. Domain errors travel as their own typed event (e.g. a future `alert` with a `category: 'bad_data'` payload), not as `error`.

**Alternatives considered:**
- Custom 30-line emitter from scratch: rejected — we'd reinvent `once` / `removeAllListeners` / `setMaxListeners` for no extra type-safety benefit, since subclassing already gives us the narrowed signatures.
- `mitt` / `nanoevents`: rejected — same generic narrowing at the cost of an external dependency; subclassing `node:events` is zero-dep and ships with the runtime.
- Node `EventEmitter` directly (no subclass): rejected — untyped at the call site, which is the thing the request asks us to fix.
- RxJS `Subject`: rejected as massive overkill — no need for backpressure, operators, or multicast semantics beyond plain fan-out.

### 2. Centerline projection: load once at boot, project every sample in memory

The GPX at `KIOSK_TRACK_PATH` is parsed once at boot into a `{ lat, lon, cumulativeMeters }[]` polyline with a `totalMeters` total. Each sample is projected onto the nearest segment to produce `{ sM, s, sector }` where `sM` is arc length in meters, `s = sM / totalMeters`, and `sector` is the index of the boundary `sM` falls into.

The simulator already loads the same GPX; we **do not** share the simulator's parsed polyline — that would couple a test-affordance to a runtime detector. Instead we factor the GPX-parsing helper into `src/backend/kiosk/track/centerline.ts` and let both the simulator and the event bus depend on it. Pure function, no DB or env reads.

**Alternative**: store derived `s` / `sector` on `decoded_samples` at ingest time. Rejected because (a) it couples ingest to track geometry, which feels wrong for what is currently a transport-decode layer, and (b) it makes recomputing `s` after a centerline survey impossible without a backfill migration. Keeping projection out of the DB means we can resurvey the track and replay history without rewriting rows.

### 3. Lap-boundary detection: unwrapped cumulative distance, not raw `s` wrap

The naïve "previous `s` near 1.0, current `s` near 0.0" check is fragile near the start/finish line under GPS jitter. We track an `unwrappedDistanceM` counter instead:

```
sM_t = project(sample_t).sM     // 0 .. totalMeters
delta = sM_t - sM_{t-1}
if delta < -totalMeters / 2:    // wrap
  delta += totalMeters
unwrappedDistanceM += delta
```

A lap boundary is detected when `floor(unwrappedDistanceM / totalMeters)` increments. This is robust to a sample landing slightly before vs slightly after the line and to jitter that briefly reverses `s`.

**Edge cases handled by this approach:**
- Negative `delta` that is *not* a wrap (small backwards GPS noise) is added as-is, mildly slowing the unwrapped counter — never a false lap.
- A sample with no fix (`fix === 0`) is dropped before projection.
- The first sample after boot bootstraps `sM_{t-1}` without emitting a lap.

### 4. Sector splits: per-sample dt accounting, allocated to the current sector

For each sample, `dt = t_now - t_prev` is added to `accumulatedSplits[sector_t]`. When a lap boundary is detected, the four accumulated values become the lap's splits, and accumulators reset.

If a sample crosses a sector boundary mid-interval, the entire `dt` is allocated to the *new* sector. At 1 Hz × 15 km/h, sectors are ≥ 60 samples wide, so the per-sector error from this approximation is bounded at ~1 s, dominated by sample granularity anyway. A more accurate proportional split is possible but is unnecessary precision for this race.

### 5. First lap: discard the warmup, count from the first completed crossing-to-crossing

When the kiosk starts mid-session (which will be common in practice — kiosk boots before race start, or recovers from a crash), the *position* the car is at when ingest starts is arbitrary. The first crossing of the start/finish line marks the start of lap 1, not its end. So:

- From boot until the first detected lap boundary: accumulate `unwrappedDistanceM` but emit nothing. This is the "warmup" phase.
- At the first lap boundary: reset split accumulators, set `currentLapStartedAt = sample.t`. Lap 1 begins.
- At the second lap boundary: emit lap 1 (its splits cover the interval between the first and second crossings).

This loses one "lap" worth of timing data per kiosk start, which is the right trade-off: we'd rather skip an indeterminate partial lap than report a misleading one.

### 6. Persistence + emit ordering: DB write first, in-process emit second

Lap completion path is:

1. Detect boundary while folding a sample.
2. Insert the `laps` row via Drizzle (`db.insert(laps).values({...})`), in a single-statement transaction (no other writes are part of "a lap completed"). Per the project's persistence policy, the detector receives the typed Drizzle client via DI; no raw SQL is used.
3. On commit success, call `bus.emit('lap', event)`.

A subscriber that re-queries the DB inside its handler is guaranteed to see the row. If the insert throws (e.g., disk full), the event is *not* emitted — the lap is lost, which is the right behavior since the system should not act on a fact that isn't durably stored. The error is logged and ingest continues. Subscribers' exceptions are isolated by the bus (decision 1) and never roll back the just-committed write.

### 7. Boot wiring: bus constructed in `bootKiosk`, registered as `onSample` to `runIngest`

`bootKiosk` is extended with:

```
const centerline = loadCenterline(KIOSK_TRACK_PATH);
const bus = createEventBus();
const lapDetector = createLapDetector({ db, centerline, bus });
runIngest({ source, db, onSample: lapDetector.handleSample });
```

No change to `runIngest`'s contract. The bus instance is currently boot-scoped; if other modules need access (future broadcaster), boot returns it for the entrypoint to wire onward.

## Risks / Trade-offs

- **Interim sector boundaries are not the real track**: until the centerline and sector points are surveyed, splits will be informationally useful but not authoritative. → Mitigated by isolating sector boundaries to a single config (`SECTOR_BOUNDARIES_S` constant) so a survey only changes one file. Surfaced in Open Questions.
- **A stationary car near the start line under GPS jitter could in principle cross-and-cross-back rapidly**: not handled by unwrapped distance alone if jitter spans the line. → Mitigated by requiring at least `MIN_LAP_DISTANCE_M = totalMeters * 0.9` of unwrapped progress between successive boundary detections; pathological jitter that drifts ~480 m forward and back is implausible.
- **Reboot mid-lap loses that lap**: documented Non-Goal. → Acceptable for v1; resume support is a separate future change if needed.
- **GPX file missing or unreadable at boot**: the lap detector cannot run. → `bootKiosk` should fail fast with a clear error naming the resolved path (same pattern the simulator already uses).
- **Untyped emit creep**: future detectors might emit raw `unknown` for convenience. → The bus's `emit<K>(type: K, event: M[K])` signature forces every emit to type-check against the `EventMap`; adding a new event type means extending the map first, which is the desired ordering.
- **Subscriber leaks** (handlers that never unsubscribe): not a real risk in this change (single boot-scoped subscriber). The inherited `setMaxListeners(n)` / `getMaxListeners()` machinery will surface accidental over-registration in future changes by logging a warning at the configured threshold — no extra plumbing required.

## Migration Plan

1. Merge the change; operators re-run `bun run db:push` to apply the new `laps` table.
2. No data backfill — existing `decoded_samples` are not replayed into laps. Laps history starts fresh.
3. Rollback: drop the `laps` table and revert the boot wiring. `runIngest` is unchanged so the rest of the kiosk continues to work.

## Open Questions

- **Sector boundary values**: interim `SECTOR_BOUNDARIES_S = [0, 0.25, 0.5, 0.75]` until the track is surveyed. Capturing the real boundaries (likely as `s` values, or as lat/lon points the centerline-projection helper can convert) is a follow-up change — possibly bundled with the track-survey work for the map.
- **Where the bus instance "lives" after boot**: this change keeps it scoped to `bootKiosk`. The first follow-up consumer (`add-kiosk-ws-broadcast`) will decide whether to return it from `bootKiosk` to the entrypoint, attach it to a kiosk-runtime context object, or hold it in a module singleton. Deferred deliberately — making that decision in isolation is premature.
