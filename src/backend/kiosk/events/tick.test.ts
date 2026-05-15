import { afterEach, beforeEach, expect, test } from "bun:test";
import { getRaceStartUnixSec } from "@shared/race";
import type { DecodedSample } from "../ingest";
import { TypedEventBus } from "./bus";
import { createTickEmitter } from "./tick";
import type { RaceEventMap, TickEvent } from "./types";

const mockCenterline = {
  points: [],
  totalMeters: 1000,
  project: (_lat: number, _lon: number) => ({ sM: 500, s: 0.5, sector: 1 as const }),
};

function makeSample(overrides: Partial<DecodedSample> = {}): DecodedSample {
  return {
    id: 1,
    rawPacketId: 1,
    seq: 1,
    t: 1000,
    lat: 48.5,
    lon: 6.5,
    speed: 30,
    heading: 90,
    hdop: 1,
    sats: 8,
    bat: null,
    cad: null,
    fix: 1,
    fix3d: 1,
    reboot: 0,
    rssi: -70,
    snr: 10,
    ...overrides,
  };
}

beforeEach(() => {
  delete process.env.RACE_START_AT;
});

afterEach(() => {
  delete process.env.RACE_START_AT;
});

test("emits one tick per fixed sample", () => {
  const bus = new TypedEventBus<RaceEventMap>();
  const emitter = createTickEmitter({ bus, centerline: mockCenterline });

  const ticks: TickEvent[] = [];
  bus.on("tick", (e) => ticks.push(e));

  emitter.handleSample(makeSample({ fix: 1 }));
  expect(ticks).toHaveLength(1);
});

test("emits no tick for fix === 0", () => {
  const bus = new TypedEventBus<RaceEventMap>();
  const emitter = createTickEmitter({ bus, centerline: mockCenterline });

  const ticks: TickEvent[] = [];
  bus.on("tick", (e) => ticks.push(e));

  emitter.handleSample(makeSample({ fix: 0 }));
  expect(ticks).toHaveLength(0);
});

test("tick fields mirror the sample", () => {
  const bus = new TypedEventBus<RaceEventMap>();
  const emitter = createTickEmitter({ bus, centerline: mockCenterline });

  const ticks: TickEvent[] = [];
  bus.on("tick", (e) => ticks.push(e));

  const sample = makeSample({ t: 9999, lat: 47.1, lon: 5.2, heading: 180, speed: 55, fix: 1 });
  emitter.handleSample(sample);

  const tick = ticks[0];
  if (!tick) throw new Error("expected a tick event");
  expect(tick.t).toBe(9999);
  expect(tick.lat).toBe(47.1);
  expect(tick.lon).toBe(5.2);
  expect(tick.heading).toBe(180);
  expect(tick.speed).toBe(55);
  expect(tick.s).toBe(0.5);
  expect(tick.sector).toBe(1);
});

test("elapsed reflects race start", () => {
  const bus = new TypedEventBus<RaceEventMap>();
  const emitter = createTickEmitter({ bus, centerline: mockCenterline });

  const ticks: TickEvent[] = [];
  bus.on("tick", (e) => ticks.push(e));

  const raceStart = getRaceStartUnixSec();
  const sampleT = raceStart - 3600; // one hour pre-race
  emitter.handleSample(makeSample({ t: sampleT, fix: 1 }));

  expect(ticks[0]?.elapsed).toBeCloseTo(-3600, 5);
});
