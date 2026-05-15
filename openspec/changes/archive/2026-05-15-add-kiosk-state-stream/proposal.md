## Why

The kiosk backend now persists telemetry and emits typed events on an in-process bus, but those events never leave the process — the TV browser has no way to see them. To start building the TV dashboard we need a wire (WebSocket) and a client-side state architecture that future panels can plug into without rewiring.

## What Changes

- Configure `Bun.serve()` with a `websocket` handler (same process, same port as existing HTTP routes — no extra server). Clients connect to `ws://<pi-host>/events`.
- Define the `RaceUpdate` discriminated union as the *only* vocabulary on the wire. Initial variants: `tick`, `lap`, `pit`, `health`, `weather`, `alert`. (`sample` is reserved for the future Pi → Server `/ingest` channel and is out of scope here.)
- Use Bun's pub/sub: subscribers `ws.subscribe("race")` in the `open` handler; the event-bus listener calls `server.publish("race", …)` to fan out `RaceUpdate` messages to every connected client.
- On `open`, before subscribing, replay a curated set of events from SQLite (existing laps, latest tick/health/weather, recent pit/alert events) to that one client via `ws.send(...)` — same wire format as live events, no special "snapshot" type.
- Per-connection state lives in `ws.data` (e.g., `connectedAt`, latest seq seen).
- Add a client-side state layer in `src/frontend/kiosk/` that opens the WS, folds `RaceUpdate` events into a `RaceState` view-model, exposes it via a React hook, and auto-reconnects with backoff.
- Mount a `/kiosk` route that renders the current `RaceState` as pretty-printed JSON — debug-only, no panels, no styling beyond the existing design tokens.

## Capabilities

### New Capabilities

- `kiosk-ws-broadcast`: Pi-side WebSocket endpoint that subscribes to the event bus and emits typed `RaceUpdate` events to connected clients, including replay-on-connect from SQLite.
- `kiosk-client-state`: Browser-side WS client + reducer + store that folds `RaceUpdate` events into a `RaceState` view-model, plus the `/kiosk` debug JSON view.

### Modified Capabilities

- `kiosk-event-bus`: adds a `tick` event emitted once per decoded sample (carrying derived `s`, `sector`, position, heading, speed, `t`). Required so the debug page has live data between sparse `lap` events — without it the WS pipeline isn't verifiable. Implemented as a new `createTickEmitter({ bus, centerline })` composed alongside the existing lap detector; lap-detection logic is untouched.
- `kiosk-telemetry-ingest`: drops the `/api/hello` and `/api/hello/:name` placeholder routes from the boot-wiring requirement. They were scaffolding from the initial setup and were never consumed; keeping them in the spec would gradually bloat the `routes:` object as real endpoints land. The catch-all `"/*"` HTML route is preserved.

The `kiosk-persistence` spec is unchanged — this change only reads from existing tables.

## Impact

- **New code**:
  - `src/backend/kiosk/ws/` — `Bun.serve()` `websocket` handler (`open`/`message`/`close`), event-bus → `server.publish("race", …)` bridge, SQLite replay query helpers.
  - `src/shared/wire/` — the `RaceUpdate` discriminated union (Zod schema + inferred type), shared between backend and client.
  - `src/frontend/kiosk/` — WS client, reducer, store hook, `RaceState` type, debug JSON page.
- **Modified code**:
  - `src/backend/index.ts` — add the `websocket` config to the existing `Bun.serve()` call.
  - `src/backend/kiosk/boot.ts` — subscribe the WS fan-out to the event bus on kiosk boot.
  - `src/frontend/App.tsx` / `src/frontend/index.html` — add a route for `/kiosk` that mounts the debug page.
- **Dependencies**: none new. `Bun.serve()` ships with WebSocket support; React + Zod are already in the tree.
- **Out of scope** (deferred to later changes): real dashboard panels, Pi → Server `/ingest` link, server mode, robust auth on public endpoints, `sample` events.
