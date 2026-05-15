## 1. Shared foundations

- [ ] 1.1 Add `src/shared/race.ts` exporting `getRaceStartUnixSec()`: reads `RACE_START_AT`, defaults to `2026-05-23T16:00:00+02:00`, throws on invalid input.
- [ ] 1.2 Add `src/shared/race.test.ts` covering default, custom value, and malformed-throws scenarios.
- [ ] 1.3 Add `src/shared/wire/race-update.ts` exporting `raceUpdateSchema` (Zod discriminated union on `type` with `tick` and `lap` variants) plus `RaceUpdate = z.infer<...>`.
- [ ] 1.4 Add `src/shared/wire/race-update.test.ts` covering valid tick parse, valid lap parse, unknown discriminator rejection.
- [ ] 1.5 Document `RACE_START_AT` in `.env.example` (default + ISO-8601-with-offset format).

## 2. Backend: tick emitter on the event bus

- [ ] 2.1 Extend `src/backend/kiosk/events/types.ts` with `TickEvent` and add `tick: TickEvent` to `RaceEventMap`.
- [ ] 2.2 Add `src/backend/kiosk/events/tick.ts` exporting `createTickEmitter({ bus, centerline })` returning `{ handleSample(sample): void }`; skip samples where `fix === 0`.
- [ ] 2.3 Wire the tick emitter alongside the lap detector in `bootKiosk`: `runIngest({ source, db, onSample: s => { tickEmitter.handleSample(s); lapDetector.handleSample(s); } })`.
- [ ] 2.4 Add `src/backend/kiosk/events/tick.test.ts`: assert one tick per fixed sample, zero ticks for `fix === 0`, correct `elapsed` from `RACE_START_AT`, no DB mutation.

## 3. Backend: WS handler, replay, bridge

- [ ] 3.1 Add `src/backend/kiosk/ws/replay.ts` exporting `buildReplay({ db, centerline }): RaceUpdate[]` — selects all `laps` ascending by `lap`, selects the latest `decoded_samples` row (if any with `fix !== 0`), projects via centerline, returns `[...laps as RaceUpdate, latestTick?]`.
- [ ] 3.2 Add `src/backend/kiosk/ws/replay.test.ts`: empty DB → empty replay; laps only → ordered lap updates; sample+laps → laps then tick.
- [ ] 3.3 Add `src/backend/kiosk/ws/handler.ts` exporting `createKioskWsHandler({ db, centerline })`: returns a `WebSocketHandler` with `data: {} as { connectedAt: number }`, `open(ws)` that runs replay via `ws.send` then `ws.subscribe("race")`, `message`/`close` no-ops.
- [ ] 3.4 Add `src/backend/kiosk/ws/bridge.ts` exporting `bridgeBusToServer({ bus, server })`: attaches `bus.on("tick", ...)` and `bus.on("lap", ...)` listeners that `server.publish("race", JSON.stringify({ type, ...payload }))`.
- [ ] 3.5 Add `src/backend/kiosk/ws/bridge.test.ts`: stub `server.publish` and assert correct topic + serialized payload for both event types.

## 4. Backend: wire it into the entrypoint

- [ ] 4.1 In `src/backend/index.ts`, when `APP_MODE === "kiosk"`, capture the `bootKiosk()` return value (`{ db, bus, centerline }` — extend `bootKiosk` to also return `centerline` if not already).
- [ ] 4.2 Pass the captured `db`, `centerline` to `createKioskWsHandler` and set `Bun.serve(...)`'s `websocket` property to it.
- [ ] 4.3 After `serve(...)` returns, call `bridgeBusToServer({ bus, server })` (kiosk mode only).
- [ ] 4.4 Delete the `/api/hello` and `/api/hello/:name` route entries from `src/backend/index.ts`.
- [ ] 4.5 Update `src/backend/kiosk/boot.test.ts` if needed (centerline now exposed via the returned handle).

## 5. Frontend: state primitives

- [ ] 5.1 Add `src/frontend/kiosk/state/types.ts` with `Lap`, `SectorAgg`, `RaceState`, and `initialRaceState`.
- [ ] 5.2 Add `src/frontend/kiosk/state/reducer.ts` exporting pure `reduce(state, update)`; handle `tick` (identity-preserving for non-tick fields) and `lap` (rebuild `laps` map, `bestLap`, `recentLaps` (cap 8), `sectors[i].last`/`.best`).
- [ ] 5.3 Add `src/frontend/kiosk/state/reducer.test.ts`: tick replaces only position fields with reference equality for the rest; bestLap tracks minimum; duplicate lap is idempotent; sector best tracks minimum across laps; recentLaps caps at 8.

## 6. Frontend: store + hook

- [ ] 6.1 Add `src/frontend/kiosk/state/store.ts` exporting `subscribe`, `getSnapshot`, `dispatch`, `setConnection`, `resetState`, and `useRaceState` (via `useSyncExternalStore`). Singleton per module load; listeners notified synchronously.
- [ ] 6.2 Add `src/frontend/kiosk/state/store.test.ts`: subscribe receives notifications; unsubscribe stops them; `setConnection` allocates a new state object; `resetState` returns to `initialRaceState`.

## 7. Frontend: WS client

- [ ] 7.1 Add `src/frontend/kiosk/ws-client.ts` exporting `connect(): () => void`. URL from `window.location` (`ws://` or `wss://`) + `/events`. Lifecycle per spec: open → setConnection("open") + reset backoff; message → parse + Zod-validate + dispatch (drop+log on failure); close/error → setConnection("closed") + exponential backoff (1s × 2^(n-1), cap 30s); on each reconnect attempt call `resetState()`.
- [ ] 7.2 Add `src/frontend/kiosk/ws-client.test.ts` against a fake `WebSocket`: valid update dispatched; invalid update dropped; backoff schedule (1s, 2s, 4s, 8s); 30s cap after many closes; successful open resets backoff; disposer cancels pending reconnect.

## 8. Frontend: debug page + routing

- [ ] 8.1 Add `src/frontend/kiosk/DebugPage.tsx`: `useRaceState()`, mount WS client in `useEffect` (dispose on unmount), render header showing `state.connection`, render `<pre>{JSON.stringify(state, null, 2)}</pre>`.
- [ ] 8.2 In `src/frontend/App.tsx`, branch on `location.pathname === "/kiosk"` and render `<DebugPage />`; other paths render the existing root content and MUST NOT initiate the WS client.

## 9. Verify

- [ ] 9.1 `bun test` — all unit tests pass.
- [ ] 9.2 `bun run check` — Biome formatter + linter clean (no `biome-ignore` workarounds).
- [ ] 9.3 Manual smoke: start with `APP_MODE=kiosk KIOSK_TELEMETRY_SOURCE=simulated bun --hot src/backend/index.ts`, open `/kiosk` in a browser; observe `connection` flipping to `"open"`, `tick` fields updating every ~1 s, and a `lap` arriving after the simulator completes one circuit.
- [ ] 9.4 Manual smoke (replay): with the dev server running and at least one lap persisted, reload `/kiosk`; observe the replayed lap appears in `recentLaps` immediately on connect, before any new live ticks.
- [ ] 9.5 Manual smoke (non-kiosk): start with `APP_MODE` unset; confirm `/kiosk` shows `connection: "closed"` and no events arrive (no WS upgrade succeeds).
