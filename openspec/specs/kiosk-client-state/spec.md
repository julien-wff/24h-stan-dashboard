# kiosk-client-state Specification

## Purpose

Defines the kiosk frontend's client-side state model and the runtime that keeps it in sync with the backend WebSocket stream. Provides the `RaceState` view-model (pure, frontend-only), a deterministic reducer that folds `RaceUpdate` events into state, a module-level store exposed to React via `useSyncExternalStore`, a WebSocket client that connects to `/events` with automatic reconnect, and a `/kiosk` debug page that renders the live state as JSON. This capability owns the contract between incoming `RaceUpdate` messages and what React components render.

## Requirements

### Requirement: `RaceState` is a pure, client-side view-model

The frontend SHALL define a `RaceState` TypeScript type in `src/frontend/kiosk/state/types.ts` with exactly the following shape (only fields driven by `tick` and `lap` events are included in v1):

```ts
type Lap = {
  lap: number;
  timeSec: number;
  splits: [number, number, number, number];
  startedAt: number;
  endedAt: number;
};

type SectorAgg = { last: number | null; best: number | null };

type RaceState = {
  // Position / motion (from tick):
  t: number | null;
  elapsed: number | null;
  lat: number | null;
  lon: number | null;
  heading: number | null;
  speed: number | null;
  s: number | null;
  sector: 0 | 1 | 2 | 3 | null;

  // Lap aggregates (from lap):
  laps: Record<number, Lap>;
  bestLap: Lap | null;
  recentLaps: Lap[];
  sectors: [SectorAgg, SectorAgg, SectorAgg, SectorAgg];

  // Connection:
  connection: "connecting" | "open" | "closed";
};
```

The exported `initialRaceState: RaceState` SHALL have every position/motion field `null`, `laps` as `{}`, `bestLap` as `null`, `recentLaps` as `[]`, each `sectors[i]` as `{ last: null, best: null }`, and `connection` as `"connecting"`.

`RaceState` MUST NOT be imported anywhere under `src/backend/`; it is a frontend-only concept.

#### Scenario: Initial state shape
- **WHEN** `initialRaceState` is read
- **THEN** every position/motion field is `null`, `laps` is `{}`, `bestLap` is `null`, `recentLaps` is `[]`, every `sectors[i]` is `{ last: null, best: null }`, and `connection` is `"connecting"`

#### Scenario: Backend tree does not import RaceState
- **WHEN** a developer greps `src/backend/` for imports from `@frontend/kiosk/state`
- **THEN** no matches are found

### Requirement: Reducer folds `RaceUpdate` events into `RaceState`

A pure function `reduce(state: RaceState, update: RaceUpdate): RaceState` SHALL live in `src/frontend/kiosk/state/reducer.ts`. Behavior by variant:

- **`tick`**: return a new state in which `t`, `elapsed`, `lat`, `lon`, `heading`, `speed`, `s`, `sector` are replaced by the update's fields; all other fields (`laps`, `bestLap`, `recentLaps`, `sectors`, `connection`) MUST be the same references as in the input state (not freshly allocated).
- **`lap`**: return a new state in which:
  - `laps` is a new object equal to `{ ...state.laps, [update.lap]: <Lap from update> }`.
  - `bestLap` is the `Lap` from the new `laps` map with the smallest `timeSec` (ties broken by smallest `lap` number); `null` if the map is empty.
  - `recentLaps` is the last (up to) 8 entries of `Object.values(laps)` sorted ascending by `lap`.
  - Each `sectors[i]` is `{ last: splitsOfLatestLap[i], best: min(splits[i]) over all laps in the new map }`, where "latest lap" means the lap with the highest `lap` number in the new map. If the map has one entry, `last === best` for every sector.
  - All position/motion fields (`t`, `elapsed`, `lat`, …, `sector`) and `connection` MUST be unchanged (===-comparable).

The reducer MUST be immutable: it MUST NOT mutate `state` or any nested object/array; new sub-objects MUST be allocated only for branches that changed.

The reducer MUST be deterministic and idempotent for identical `lap` updates: applying the same `lap` payload twice in a row MUST yield a state deeply equal to applying it once.

#### Scenario: Tick replaces position fields only
- **WHEN** `reduce(state, { type: "tick", t: 10, elapsed: 5, lat: 48, lon: 6, heading: 90, speed: 15, s: 0.5, sector: 1 })` is called against any state
- **THEN** the returned state has those eight fields updated, and `laps`, `bestLap`, `recentLaps`, `sectors`, `connection` are the same references as in the input

#### Scenario: Lap with the smallest time becomes bestLap
- **WHEN** three laps with `timeSec` 95, 90, 92 are dispatched in any order
- **THEN** `state.bestLap.timeSec === 90`

#### Scenario: Duplicate lap is idempotent
- **WHEN** the same `lap` update (same `lap` number, same payload) is dispatched twice in sequence
- **THEN** the state after both dispatches deeply equals the state after one dispatch

#### Scenario: Sector best tracks the minimum across laps
- **WHEN** lap 1 with splits `[20, 25, 22, 23]` then lap 2 with splits `[22, 24, 21, 24]` are dispatched in that order
- **THEN** `state.sectors` equals `[{ last: 22, best: 20 }, { last: 24, best: 24 }, { last: 21, best: 21 }, { last: 24, best: 23 }]`

#### Scenario: Recent laps cap at 8
- **WHEN** 12 laps (lap=1..12) are dispatched in order
- **THEN** `state.recentLaps` has length 8 and contains laps 5..12 in ascending order

### Requirement: Module-level store exposes state via `useSyncExternalStore`

A singleton store SHALL live in `src/frontend/kiosk/state/store.ts` and SHALL expose:

- `subscribe(listener: () => void): () => void` — registers a listener for state-change notifications; returns an unsubscribe function.
- `getSnapshot(): RaceState` — returns the current state object. The returned reference MUST be stable across calls until a state change occurs.
- `dispatch(update: RaceUpdate): void` — runs the reducer with the current state and the update, replaces the current state with the result, then notifies all subscribed listeners.
- `setConnection(status: "connecting" | "open" | "closed"): void` — updates only the `connection` field on the current state (allocating a new state object so identity changes) and notifies listeners.
- `resetState(): void` — replaces the current state with `initialRaceState` and notifies listeners.
- `useRaceState(): RaceState` — a React hook implemented via `useSyncExternalStore(subscribe, getSnapshot)`.

Listeners MUST be notified synchronously after each state change. The store MUST be a singleton per module load (one shared instance per page).

#### Scenario: Subscribe receives notifications
- **WHEN** a listener is subscribed and `dispatch({ type: "tick", t: 1, elapsed: 0, lat: 0, lon: 0, heading: 0, speed: 0, s: 0, sector: 0 })` is called
- **THEN** the listener is invoked at least once, and a subsequent `getSnapshot()` call returns a state with `t === 1`

#### Scenario: Unsubscribe stops notifications
- **WHEN** a listener is unsubscribed and a `dispatch(...)` is later called
- **THEN** the unsubscribed listener is NOT invoked

#### Scenario: useRaceState re-renders on dispatch
- **WHEN** a React component mounts using `useRaceState()` and a `dispatch(...)` is called
- **THEN** the component re-renders with the updated snapshot

#### Scenario: setConnection allocates a new state object
- **WHEN** `setConnection("open")` is called against a state with `connection === "connecting"`
- **THEN** `getSnapshot()` returns a new object reference whose `connection === "open"` and whose other fields equal the previous state

### Requirement: WebSocket client connects, dispatches, and auto-reconnects

A WebSocket client module SHALL live in `src/frontend/kiosk/ws-client.ts` and SHALL export `connect(): () => void`, returning a disposer that closes the socket and cancels any pending reconnect timer.

On invocation, the client SHALL:

1. Compute the WS URL from `window.location` (`ws:` for `http:`, `wss:` for `https:`), using the page's host and a fixed path `/events`.
2. Call `store.resetState()` and `store.setConnection("connecting")`, then open the WebSocket.
3. On `open`: call `store.setConnection("open")` and reset its internal backoff counter `n` to `0`.
4. On `message`: `JSON.parse` the message data; if parsing succeeds, run `raceUpdateSchema.safeParse(...)` on the parsed value; on Zod success, call `store.dispatch(update)`; on either parse failure, log the error to `console.error` and drop the message (do NOT dispatch).
5. On `close` or `error`: call `store.setConnection("closed")`, increment `n`, and schedule a reconnect after `Math.min(1000 * 2 ** (n - 1), 30000)` ms. When the timer fires, the client SHALL call `store.resetState()`, `store.setConnection("connecting")`, and open a new WebSocket (returning to step 3).

The disposer returned by `connect()` MUST cancel any pending reconnect timer and close the current socket (if any).

The client MUST NOT retain a queue of unsent messages; v1 is server → client only.

#### Scenario: Valid update is dispatched
- **WHEN** the WebSocket receives the string `{"type":"tick","t":1,"elapsed":0,"lat":48,"lon":6,"heading":90,"speed":15,"s":0.5,"sector":1}`
- **THEN** `store.dispatch` is invoked exactly once with the parsed `RaceUpdate`

#### Scenario: Invalid update is dropped
- **WHEN** the WebSocket receives the string `{"type":"unknown"}`
- **THEN** `store.dispatch` is NOT invoked, and an error is logged via `console.error`

#### Scenario: Malformed JSON is dropped
- **WHEN** the WebSocket receives the string `not json`
- **THEN** `store.dispatch` is NOT invoked, and an error is logged via `console.error`

#### Scenario: Reconnect backoff schedule
- **WHEN** the WebSocket closes four consecutive times without any successful `open` in between
- **THEN** the reconnect delays for those four closes are 1000, 2000, 4000, 8000 ms respectively

#### Scenario: Reconnect backoff caps at 30s
- **WHEN** the WebSocket closes for the 10th consecutive time without any successful `open` in between
- **THEN** the next reconnect is scheduled at most 30000 ms later

#### Scenario: Successful open resets backoff
- **WHEN** the WebSocket closes (backoff `n` ≥ 1), then a subsequent reconnect opens successfully
- **THEN** `n` resets to `0`, so the next subsequent close schedules a reconnect at 1000 ms

#### Scenario: Reconnect rebuilds state from replay
- **WHEN** the reconnect timer fires
- **THEN** `store.resetState()` is called before the new WebSocket is opened, so the eventual replay messages rebuild the state from scratch

#### Scenario: Disposer cancels reconnect
- **WHEN** `connect()` returned a disposer, the WebSocket has closed and a reconnect is scheduled, and the disposer is then called
- **THEN** the reconnect timer is cancelled and no new WebSocket is opened

### Requirement: Debug page mounted at `/kiosk` renders the state as JSON

The frontend SHALL render a `<DebugPage />` React component when `location.pathname === "/kiosk"`. The page SHALL:

- Read `state` via `useRaceState()`.
- Mount the WebSocket client on mount (via `useEffect`) and call the returned disposer on unmount.
- Render a header line showing the current `state.connection` value (e.g., `"connecting"`, `"open"`, `"closed"`).
- Render a `<pre>` element whose text content is `JSON.stringify(state, null, 2)`.

Routing MAY be implemented by a simple `location.pathname === "/kiosk"` branch in `App.tsx`; no routing library is required.

When `location.pathname !== "/kiosk"`, `<DebugPage />` MUST NOT be mounted and the WebSocket client MUST NOT be initiated by the frontend.

#### Scenario: Page renders the state as JSON
- **WHEN** a user navigates to `/kiosk` and the store contains a non-empty state
- **THEN** the page contains a `<pre>` whose text content equals `JSON.stringify(state, null, 2)`

#### Scenario: Connection status is visible
- **WHEN** `state.connection` is `"open"`
- **THEN** the page header line contains the substring `"open"`

#### Scenario: WS client is mounted only at `/kiosk`
- **WHEN** a user navigates to `/`
- **THEN** the existing root content is rendered, `<DebugPage />` is NOT mounted, and no WebSocket connection is opened

#### Scenario: WS client is disposed on unmount
- **WHEN** a user navigates away from `/kiosk` (or the component unmounts for any other reason)
- **THEN** the disposer returned by `connect()` is called, closing the WebSocket and cancelling any pending reconnect timer
