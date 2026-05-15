## Why

The kiosk today persists raw and decoded telemetry but produces no race-meaningful facts — no completed laps, no per-sector splits, no in-process events for downstream layers (WS broadcast, forwarder, alerts) to subscribe to. The dashboard cannot render best lap, recent laps, or sector bests until something turns the raw GPS stream into "a lap just ended". This change introduces that layer, scoped narrowly to lap detection so the harder cross-cutting work (broadcast, forwarding) can land in follow-up changes against a stable hook.

## What Changes

- Introduce a new `kiosk-event-bus` capability: an in-process publisher sitting between ingest and any future broadcaster. It consumes the existing `runIngest({ onSample })` callback and emits typed domain events when something race-meaningful happens.
- Implement **lap detection** as the bus's first (and only) detector for this change:
  - Load the known track centerline from the GPX file at `KIOSK_TRACK_PATH` at boot.
  - Project each decoded sample onto the centerline to derive `s ∈ [0, 1)` and `sector ∈ {0,1,2,3}`.
  - Detect a lap completion when `s` wraps past the start/finish line; accumulate elapsed time per sector during the lap.
  - On completion, persist a `laps` row and emit a `lap` domain event with `{ lap, timeSec, splits[4], startedAt, endedAt }`.
- Persist completed laps in a new `laps` table — `{ lap (PK), started_at, ended_at, time_sec, sector1_sec, sector2_sec, sector3_sec, sector4_sec }`. **No `is_best_*` flag columns**: best lap and best sector are derived on read via SQL `MIN()`.
- The event bus exposes a typed subscribe API (`bus.on('lap', handler)`) so future changes can plug WS broadcast / forwarder in without touching detection logic.
- Boot wiring: `bootKiosk` constructs the event bus, registers its `onSample` handler with `runIngest`, and starts ingest as it does today.

**Out of scope** (each becomes its own follow-up change):
- WS broadcast (`add-kiosk-ws-broadcast`).
- Pi → Server forwarding outbox (`add-kiosk-forwarder`).
- Pit detection, alert detection (future event-bus detectors).
- Server-mode mirror of the `laps` table (`add-server-mode-skeleton`).

## Capabilities

### New Capabilities
- `kiosk-event-bus`: in-process detector + publisher that turns decoded telemetry samples into typed domain events and persists derived race facts. Scope of this change: lap detection only, backed by the GPX centerline.

### Modified Capabilities
- `kiosk-persistence`: adds the `laps` table (with per-sector columns) to the kiosk schema. Existing requirements on `raw_packets` / `decoded_samples` and the access path are unchanged.

## Impact

- **Code**: new module tree at `src/backend/kiosk/events/` (bus orchestrator, lap detector, centerline-projection helper). `boot.ts` gains a single wire-up step. `runIngest` is not modified — it already accepts `onSample`.
- **Schema**: new `laps` table in `src/backend/kiosk/db/schema.ts`. Operators must re-run `bun run db:push` after merge.
- **Config**: reuses the existing `KIOSK_TRACK_PATH` env var (also used by the simulator) — no new env vars.
- **Dependencies**: none new; centerline projection is a small in-repo helper (haversine + segment projection), consistent with the simulator's existing GPX handling.
- **Tests**: deterministic, fixture-driven — feed a known sample sequence through the bus and assert `laps` rows + emitted events.
