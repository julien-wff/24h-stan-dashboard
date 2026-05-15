## ADDED Requirements

### Requirement: WebSocket endpoint is served by `Bun.serve()` only in kiosk mode

The kiosk runtime SHALL extend the existing `Bun.serve()` invocation in `src/backend/index.ts` with a `websocket` handler when (and only when) `APP_MODE=kiosk`. The handler MUST be configured via Bun's native `websocket` property on the `serve(...)` options object; no manual `server.upgrade(req)` call is required since Bun handles the protocol upgrade automatically when a `websocket` config is present.

When `APP_MODE` is anything other than `"kiosk"`, the `websocket` property MUST be omitted from the `serve(...)` options; the catch-all `"/*"` HTML route MUST continue to be served unchanged.

The websocket handler factory SHALL live at `src/backend/kiosk/ws/handler.ts` and SHALL accept the `{ db, bus }` returned by `bootKiosk()`. The factory SHALL return a Bun `WebSocketHandler` object suitable for passing as the `websocket` property of `serve(...)`. Per-connection context SHALL be typed as `{ connectedAt: number }` and set in the handler's `open` callback to `{ connectedAt: Date.now() }`.

#### Scenario: Kiosk mode attaches websocket config
- **WHEN** the process starts with `APP_MODE=kiosk` against a DB whose schema has been pushed
- **THEN** `Bun.serve(...)` is configured with both `routes` (unchanged) and a `websocket` handler, and the `bootKiosk` return value is captured (rather than discarded) so its `db` and `bus` reach the handler factory

#### Scenario: Non-kiosk modes have no websocket
- **WHEN** the process starts with `APP_MODE` unset or set to any value other than `"kiosk"`
- **THEN** no `websocket` config is passed to `Bun.serve(...)`, and a client attempt to open a WebSocket connection results in a non-upgrade HTTP response

### Requirement: `RaceUpdate` is the only wire vocabulary

A single discriminated union `RaceUpdate` SHALL be defined in `src/shared/wire/race-update.ts` as a Zod discriminated union on the `type` field, with `z.infer` deriving the TypeScript type. Both the backend WS bridge and the frontend WS client MUST import this single definition; no parallel or duplicated definitions are permitted.

For this change, `RaceUpdate` SHALL contain exactly two variants:

```ts
type RaceUpdate =
  | {
      type: "tick";
      t: number;
      elapsed: number;
      lat: number;
      lon: number;
      heading: number;
      speed: number;
      s: number;
      sector: 0 | 1 | 2 | 3;
    }
  | {
      type: "lap";
      lap: number;
      timeSec: number;
      splits: [number, number, number, number];
      startedAt: number;
      endedAt: number;
    };
```

All messages sent over the WebSocket SHALL be UTF-8 strings produced by `JSON.stringify(...)` on a valid `RaceUpdate` value. Sending any other shape is a contract violation.

#### Scenario: Schema exports the union
- **WHEN** a developer imports `raceUpdateSchema` and the `RaceUpdate` type from `@shared/wire/race-update`
- **THEN** both are available; the schema is a Zod `discriminatedUnion("type", [...])`; the type equals `z.infer<typeof raceUpdateSchema>`

#### Scenario: Schema validates both variants
- **WHEN** `raceUpdateSchema.safeParse({ type: "tick", t: 1, elapsed: 0, lat: 48, lon: 6, heading: 90, speed: 15, s: 0.5, sector: 1 })` is called
- **THEN** parsing succeeds and the data is typed as the `tick` variant

- **WHEN** `raceUpdateSchema.safeParse({ type: "lap", lap: 1, timeSec: 90, splits: [22.5, 22.5, 22.5, 22.5], startedAt: 1000, endedAt: 91000 })` is called
- **THEN** parsing succeeds and the data is typed as the `lap` variant

#### Scenario: Schema rejects unknown variants
- **WHEN** `raceUpdateSchema.safeParse({ type: "sample", lat: 48 })` is called
- **THEN** parsing fails with an issue indicating the unrecognized discriminator value

### Requirement: Connected clients receive a curated replay before live updates

On WebSocket `open(ws)`, the handler SHALL perform the following steps in order, synchronously with respect to the event loop:

1. Query the kiosk DB for the replay:
   - All persisted `laps` rows ordered ascending by `lap`, each formatted as a `{ type: "lap", lap, timeSec, splits, startedAt, endedAt }` `RaceUpdate`.
   - The most recent `decoded_samples` row (by `id` descending). If one exists and its `fix !== 0`, it is projected through the loaded centerline and formatted as a single `{ type: "tick", t, elapsed, lat, lon, heading, speed, s, sector }` `RaceUpdate`, where `elapsed = t - getRaceStartUnixSec()`. If no usable sample exists, no `tick` is replayed.
2. Send each replay update via `ws.send(JSON.stringify(update))`. Laps SHALL be sent in lap-number order; the tick (if any) SHALL be sent last.
3. After all replay messages are sent, call `ws.subscribe("race")` so subsequent live updates reach this client.

#### Scenario: Replay laps in order
- **WHEN** three laps exist in the DB (lap=1, 2, 3) and a client opens a WebSocket connection
- **THEN** the client receives three `{ type: "lap", ... }` messages in order (lap=1, then 2, then 3) before any live messages

#### Scenario: Latest sample is replayed as a tick
- **WHEN** at least one `decoded_samples` row with `fix !== 0` exists and a client opens a WebSocket connection
- **THEN** the client receives exactly one `{ type: "tick", ... }` message derived from the most recent row, with `s` and `sector` matching the centerline projection of its lat/lon

#### Scenario: Empty DB produces no replay
- **WHEN** a client opens a WebSocket connection against an empty `laps` table and an empty `decoded_samples` table
- **THEN** no replay messages are sent; the client receives only future live updates after the topic subscription

#### Scenario: Subscribe happens after replay
- **WHEN** replay completes for a connection
- **THEN** `ws.subscribe("race")` is called exactly once for that connection, and any later `server.publish("race", ...)` is delivered to it

### Requirement: Event bus is bridged to the WebSocket topic `"race"`

After `Bun.serve(...)` is constructed and `bootKiosk()` has returned its `bus`, the kiosk runtime SHALL attach two bus listeners that translate domain events into wire-format `RaceUpdate` messages and fan them out via `server.publish("race", ...)`:

- `bus.on("tick", payload)` → `server.publish("race", JSON.stringify({ type: "tick", ...payload }))`
- `bus.on("lap",  payload)` → `server.publish("race", JSON.stringify({ type: "lap", ...payload }))`

The bridging SHALL live in `src/backend/kiosk/ws/bridge.ts`, exposing a `bridgeBusToServer({ bus, server }): void` function. It SHALL be called exactly once from `src/backend/index.ts`, after `Bun.serve(...)` returns and only when `APP_MODE === "kiosk"`. When `APP_MODE !== "kiosk"`, the bridge MUST NOT be attached.

The bridge MUST NOT subscribe sockets to topics on its own (subscription is the `open` handler's responsibility). It MUST NOT inspect or filter by subscriber state — `server.publish` reaches all current subscribers of `"race"` regardless of how they were attached.

#### Scenario: Tick events fan out to all subscribers
- **WHEN** two clients are subscribed to topic `"race"` and the bus emits a `tick` event
- **THEN** both clients receive a `{ "type": "tick", ... }` message whose fields match the bus payload

#### Scenario: Lap events fan out to all subscribers
- **WHEN** one client is subscribed to topic `"race"` and the bus emits a `lap` event
- **THEN** that client receives a `{ "type": "lap", ... }` message whose fields match the bus payload

#### Scenario: No bridge in non-kiosk modes
- **WHEN** the process starts with `APP_MODE` unset
- **THEN** `bridgeBusToServer` is not called, no bus listeners are attached, and `bootKiosk` is not invoked
