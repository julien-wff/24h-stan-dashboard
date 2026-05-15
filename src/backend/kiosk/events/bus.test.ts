import { expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { TypedEventBus } from "./bus";
import type { LapEvent, RaceEventMap } from "./types";

const makeBus = () => new TypedEventBus<RaceEventMap>();

const sampleLap: LapEvent = {
  lap: 1,
  timeSec: 60,
  splits: [15, 15, 15, 15],
  startedAt: 1000,
  endedAt: 61000,
};

test("TypedEventBus.prototype instanceof EventEmitter", () => {
  const bus = makeBus();
  expect(bus instanceof EventEmitter).toBe(true);
});

test("once() fires exactly once then unregisters", () => {
  const bus = makeBus();
  const calls: LapEvent[] = [];
  bus.once("lap", (e) => calls.push(e));
  bus.emit("lap", sampleLap);
  bus.emit("lap", sampleLap);
  expect(calls.length).toBe(1);
});

test("removeAllListeners() removes registered handlers", () => {
  const bus = makeBus();
  const calls: LapEvent[] = [];
  bus.on("lap", (e) => calls.push(e));
  bus.removeAllListeners("lap");
  bus.emit("lap", sampleLap);
  expect(calls.length).toBe(0);
});

test("listener exception does not abort fan-out to remaining listeners", () => {
  const bus = makeBus();
  const second = mock(() => {});
  bus.on("lap", () => {
    throw new Error("boom");
  });
  bus.on("lap", second);
  expect(() => bus.emit("lap", sampleLap)).not.toThrow();
  expect(second).toHaveBeenCalledTimes(1);
});

test("emit does not throw when a listener throws", () => {
  const bus = makeBus();
  bus.on("lap", () => {
    throw new Error("kaboom");
  });
  expect(() => bus.emit("lap", sampleLap)).not.toThrow();
});

// @ts-expect-error — intentionally wrong type: lap field must be number, not string
const _typeCheck: () => void = () =>
  new TypedEventBus<RaceEventMap>().emit("lap", {
    lap: "oops",
    timeSec: 0,
    splits: [0, 0, 0, 0],
    startedAt: 0,
    endedAt: 0,
  });
