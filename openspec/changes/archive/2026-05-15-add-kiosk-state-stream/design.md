## Context

After `add-kiosk-event-bus`, the kiosk backend persists telemetry to SQLite and emits typed `lap` events on an in-process bus (`TypedEventBus<RaceEventMap>`). `bootKiosk()` returns `{ db, bus, stopIngest }` but `src/backend/index.ts` currently discards that handle — `Bun.serve()` is wired only to the existing HTTP routes.

This change adds the WebSocket transport from the event bus to a browser client, plus a debug-only `/kiosk` page that renders the assembled client state as JSON. Constraints:

- Single Bun process; no extra server. `Bun.serve()` ships with built-in WebSocket + pub/sub.
- No UI work beyond JSON dump — the goal is to validate the pipeline end-to-end, not build panels.
- "Robust and expandable": the architecture must accept new event types and new client slices without rewriting.
- The TV is on the same LAN as the Pi; no public exposure of this endpoint, no auth in scope.

## Goals / Non-Goals

**Goals:**
- A single `RaceUpdate` discriminated union shared between backend and client, with Zod validation on both sides.
- Pi → browser fan-out via Bun's native `ws.subscribe` / `server.publish` pub-sub.
- Replay-on-connect from SQLite so a fresh client (or a reconnect) sees existing laps and the latest position without any "snapshot" envelope — same wire vocabulary as live events.
- Client-side state architecture: pure reducer + module-level store + `useSyncExternalStore` hook, ready for selector-based subscriptions when real panels arrive.
- Auto-reconnect with exponential backoff.
- A `/kiosk` route that dumps the current `RaceState` as JSON for visual verification.

**Non-Goals:**
- Real dashboard panels, styling, layout — debug JSON only.
- Pi → Server forwarding (`/ingest`) — separate future change.
- Server mode (`/events` served from the public server) — separate future change.
- Auth / rate limiting — local LAN only for now.
- Pit/health/weather/alert event variants — declared in future changes as their detectors land. This change only carries `tick` and `lap`.
- Heartbeat pings, custom backpressure, binary frames — defaults are fine at ~1 Hz traffic.

## Decisions

### 1. Add `tick` to the event bus in this change

The bus today emits only `lap`. With only `lap`, the debug page is dead air between lap completions (~30 s+), making it impossible to *verify* the pipeline is alive. We add a minimal `tick` event emitted once per decoded sample (~1 Hz), carrying the derived `{ s, sector, lat, lon, heading, speed, t }`.

**Alternatives considered:**
- *Only `lap` events on the wire.* Cheaper scope but defeats the debug purpose — you can't tell a stalled WS from a sparse event stream.
- *Tick as a separate, non-bus path* (read directly from `runIngest`'s `onSample`). Splits the architecture: bus events go through `server.publish`, tick goes through some other side channel. Two patterns where one will do.
- *Defer `tick` to a later change.* Means this change ships a non-verifiable feature.

Implementation: a new `createTickEmitter({ bus, centerline })` consumed alongside `lapDetector` from `runIngest`'s `onSample`. Both call `centerline.project(...)` independently — cheap (binary search on a small polyline) and avoids tangling lap-detection state with tick emission.

This is a small but real modification to the `kiosk-event-bus` capability — the proposal's "Modified Capabilities" list reflects that.

### 2. One pub-sub topic, all events on it

All `RaceUpdate` messages publish to a single topic, `"race"`. Subscribers subscribe once on `open`; filtering happens client-side by discriminator if ever needed.

**Alternatives considered:** per-category topics (`race.tick`, `race.lap`). Useful only when *different* clients want *different* subsets. The TV always wants everything. Adds bookkeeping for no current benefit. We can split later if a phone-side client wants to skip `tick` to save bandwidth.

### 3. Replay-on-connect: `ws.send()` in `open`, then `ws.subscribe("race")`

On WebSocket `open`:
1. Query SQLite for replay material (existing laps; latest decoded sample for a synthetic `tick`).
2. For each replay item, `ws.send(JSON.stringify(update))` — one message per `RaceUpdate`, same wire format as live events.
3. Call `ws.subscribe("race")` to receive future live updates.

This preserves a single wire vocabulary and a single client reducer code path: replay events and live events go through the *same* `reduce(state, update)`.

**Alternatives considered:**
- *`snapshot` event variant* carrying an assembled `RaceState`. Means the client needs two parsers (replay shape + live shape) and the server needs a shape-assembly module. Adds a redundant abstraction; the client already has the reducer.
- *Subscribe first, then replay.* Out-of-order delivery in the boundary window (live `tick` arrives before replayed `lap`s, leaving `recentLaps` momentarily out of order in the JSON dump). The boundary in our chosen order is microseconds and the impact is "an event might publish during replay and reach the client before all replay messages are sent" — see Risks.

### 4. Wire format: JSON, validated by Zod at both ends

`RaceUpdate` is a Zod discriminated union in `src/shared/wire/race-update.ts`. Backend `JSON.stringify(update)` before `server.publish(...)`. Client `JSON.parse` then `RaceUpdate.safeParse(...)` before dispatch; parse failures are logged and dropped (don't crash the client). The shape is type-safe on both sides via `z.infer`.

**Alternatives considered:** raw object via Bun's structured pub-sub. Bun's `server.publish` accepts strings/`ArrayBuffer`, not objects — JSON is the natural choice. Binary (CBOR / MessagePack) saves bytes but at ~1 Hz × ~150 B/msg, it's not the bottleneck and would complicate debugging.

### 5. Client store: module-level external store + `useSyncExternalStore`

A plain object holds `RaceState`. Subscribers register a listener; the store notifies on each reduce. React components consume via `useSyncExternalStore(subscribe, getSnapshot)` with optional selectors when slicing arrives later.

**Alternatives considered:**
- *Zustand.* Identical end-result, adds a dep. Not warranted for one consumer.
- *React Context + `useReducer`.* Context triggers every consumer on any update; would force premature memoization once panels arrive.
- *Redux Toolkit.* Overkill for a single reducer and a single read site.

The reducer is a pure function `(state, update) => state` (immutable updates), unit-testable without React.

### 6. Auto-reconnect with capped exponential backoff

WS client: on `close` or `error`, wait `min(1000 * 2^n, 30000)` ms then reconnect. Reset `n` to 0 on successful `open`. On every successful open, replace the entire state with a fresh empty `RaceState` (no stale data across reconnects) — replay then refills it.

**Alternatives considered:** preserve old state across reconnect and merge replay. Adds dedup logic and assumes a `seq`-based protocol we don't have yet. v1 is simpler: drop, replay, resume.

### 7. WebSocket handler wiring

`src/backend/index.ts` captures the `bootKiosk()` return value when `APP_MODE=kiosk`, then constructs the `websocket` config from a factory: `createKioskWsHandler({ db, bus })`. The handler closure captures `db` (for replay queries) and `bus` (subscribes to `lap` and `tick` and republishes to topic `"race"` via the `server` reference handed to `open`).

Per Bun's WS API:
- `websocket.data` is typed `{ connectedAt: number }`. Set in `open`.
- `websocket.open(ws)` runs replay then `ws.subscribe("race")`. The `server.publish` call lives outside the handler — see below.
- `websocket.message(ws, msg)` is a no-op v1; client → server is reserved for future commands.
- `websocket.close(ws)` logs the disconnect; Bun auto-unsubscribes the socket from all topics.

For `server.publish("race", ...)`, we need a reference to `server`. The cleanest pattern: stash the `server` after `serve(...)` returns, in a module-local closure, and have the bus listener call `server.publish(...)`. The bus listeners are attached after `serve()` returns (so `server` is in scope).

When `APP_MODE !== "kiosk"`, no `websocket` config is added, and the `/kiosk` route on the frontend simply never receives data (shows the empty initial state).

### 8. Debug page route

`/kiosk` in the React app mounts `<DebugPage />`, which:
- Reads `RaceState` via the store hook.
- Renders a `<pre>` with `JSON.stringify(state, null, 2)`.
- Shows a small connection-status pill (`connecting` / `open` / `closed`).

Mounted via a tiny client-side check on `location.pathname` (no router lib — adding one is out of scope, the catch-all `/*` route in `Bun.serve` already serves the same `index.html` for every path).

### 9. File layout

```
src/shared/wire/
  race-update.ts          # Zod schema + z.infer type for RaceUpdate

src/backend/kiosk/
  events/
    types.ts              # add TickEvent to RaceEventMap
    tick.ts               # createTickEmitter({ bus, centerline })
  ws/
    handler.ts            # createKioskWsHandler({ db, bus, getServer })
    replay.ts             # buildReplay(db) → RaceUpdate[]
    bridge.ts             # bus → server.publish("race", ...) wiring

src/frontend/kiosk/
  state/
    types.ts              # RaceState, Lap, Sector, RaceEvent
    reducer.ts            # reduce(state, update) → state (pure)
    store.ts              # module-level store + subscribe + useSyncExternalStore hook
  ws-client.ts            # connect/dispatch/reconnect
  DebugPage.tsx           # JSON dump + status pill
```

## Risks / Trade-offs

- **Replay/live race window:** [A bus event firing between SQLite replay queries and `ws.subscribe("race")` is lost for that client] → Mitigation: order is `read replay → send replay → subscribe → live`. The window is one event-loop tick — sub-millisecond. The impact is one missed `tick` at worst (laps are persisted to SQLite first, so a lap firing in the window is *already* in the replay query if the query ran *after* the insert). Accept for v1.

- **No client-side dedup:** [If the same lap is in replay *and* arrives live (lap-detector emits at the same instant the replay query runs), the client renders it twice] → Mitigation: reducer keys laps by `lap` number — second arrival overwrites the first, no duplication in the rendered state. The `recentLaps` array is rebuilt from a map keyed on `lap`, not appended blindly.

- **State loss on reconnect:** [Each reconnect drops state and waits for replay] → Acceptable: replay is fast (a handful of small SELECTs). The debug page will flicker between reconnects, which is *informative* in this stage.

- **`tick` adds CPU per sample:** [Centerline projection now runs twice per sample — once in `createLapDetector`, once in `createTickEmitter`] → Mitigation: projection is a binary search on a small polyline (<1k points), nanosecond-class. If profiling ever flags it, share a projected-sample cache via a small wrapper struct. Premature otherwise.

- **No backpressure handling:** [If the kernel send buffer fills, `ws.send()` returns -1 and the message is dropped] → At ~1 Hz, irrelevant. The reducer is idempotent enough that an occasional drop is invisible.

- **Wire schema drift:** [If backend `RaceUpdate` shape changes but the client bundle is stale (cached `index.html`)] → Zod `safeParse` on the client logs and drops invalid messages instead of crashing. Acceptable for a single-operator dev loop; production rollout is out of scope for this change.

## Migration Plan

No schema changes — `kiosk-persistence` stays as-is; this change only *reads* from the existing tables.

Rollout is purely additive code: ship the change, restart the kiosk process, open `/kiosk` in a browser.

The dead `/api/hello` and `/api/hello/:name` routes (placeholders from the initial scaffolding, never consumed) are removed from `src/backend/index.ts` in this change — they only existed as a smoke-test of the routes API and now compete for namespace with future real endpoints. The catch-all `"/*"` HTML route stays.

Rollback is reverting the merge.

## Resolved Questions

- **Race start.** Lives in `src/shared/race.ts` as `getRaceStartUnixSec()`, which reads env var `RACE_START_AT` (ISO-8601 with offset, e.g. `2026-05-23T16:00:00+02:00`) and defaults to `2026-05-23T16:00:00+02:00` (16:00 CEST). The tick emitter imports this and the wire `tick` event carries `elapsed: number` (seconds since race start, negative if pre-race) so the client never needs the race-start constant.
- **Topic name:** `"race"`. Single topic for all `RaceUpdate` messages.
- **Variants on the wire in v1:** `tick` and `lap` only. Other variants (`pit`, `health`, `weather`, `alert`) come with their respective detectors in future changes.
