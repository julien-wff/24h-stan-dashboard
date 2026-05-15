import { expect, test } from "bun:test";
import { TypedEventBus } from "../events/bus";
import type { LapEvent, RaceEventMap, TickEvent } from "../events/types";
import { bridgeBusToServer } from "./bridge";

function makeServer() {
  const calls: Array<{ topic: string; message: string }> = [];
  const server = {
    publish(topic: string, message: string) {
      calls.push({ topic, message });
    },
  };
  return { server: server as never, calls };
}

test("tick event publishes to race topic with correct payload", () => {
  const bus = new TypedEventBus<RaceEventMap>();
  const { server, calls } = makeServer();
  bridgeBusToServer({ bus, server });

  const tickPayload: TickEvent = {
    t: 1000,
    elapsed: 100,
    lat: 48.5,
    lon: 6.5,
    heading: 90,
    speed: 30,
    s: 0.5,
    sector: 1,
  };
  bus.emit("tick", tickPayload);

  expect(calls).toHaveLength(1);
  expect(calls[0]?.topic).toBe("race");
  const msg = JSON.parse(calls[0]!.message);
  expect(msg.type).toBe("tick");
  expect(msg.t).toBe(1000);
  expect(msg.lat).toBe(48.5);
});

test("lap event publishes to race topic with correct payload", () => {
  const bus = new TypedEventBus<RaceEventMap>();
  const { server, calls } = makeServer();
  bridgeBusToServer({ bus, server });

  const lapPayload: LapEvent = {
    lap: 3,
    timeSec: 90,
    splits: [22, 23, 22, 23],
    startedAt: 1000,
    endedAt: 91000,
  };
  bus.emit("lap", lapPayload);

  expect(calls).toHaveLength(1);
  expect(calls[0]?.topic).toBe("race");
  const msg = JSON.parse(calls[0]!.message);
  expect(msg.type).toBe("lap");
  expect(msg.lap).toBe(3);
  expect(msg.timeSec).toBe(90);
});
