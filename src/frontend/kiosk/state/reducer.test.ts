import { expect, test } from "bun:test";
import type { RaceUpdate } from "@shared/wire/race-update";
import { reduce } from "./reducer";
import { initialRaceState } from "./types";

function makeTick(overrides: Partial<Extract<RaceUpdate, { type: "tick" }>> = {}): RaceUpdate {
  return {
    type: "tick",
    t: 10,
    elapsed: 5,
    lat: 48,
    lon: 6,
    heading: 90,
    speed: 15,
    s: 0.5,
    sector: 1,
    ...overrides,
  };
}

function makeLap(
  lap: number,
  timeSec: number,
  splits: [number, number, number, number] = [22, 23, 22, 23],
): RaceUpdate {
  return {
    type: "lap",
    lap,
    timeSec,
    splits,
    startedAt: 1000,
    endedAt: 1000 + timeSec * 1000,
  };
}

test("tick replaces only position fields", () => {
  const tick = makeTick({
    t: 10,
    elapsed: 5,
    lat: 48,
    lon: 6,
    heading: 90,
    speed: 15,
    s: 0.5,
    sector: 1,
  });
  const result = reduce(initialRaceState, tick);

  expect(result.t).toBe(10);
  expect(result.elapsed).toBe(5);
  expect(result.lat).toBe(48);
  expect(result.lon).toBe(6);
  expect(result.heading).toBe(90);
  expect(result.speed).toBe(15);
  expect(result.s).toBe(0.5);
  expect(result.sector).toBe(1);

  expect(result.laps).toBe(initialRaceState.laps);
  expect(result.bestLap).toBe(initialRaceState.bestLap);
  expect(result.recentLaps).toBe(initialRaceState.recentLaps);
  expect(result.sectors).toBe(initialRaceState.sectors);
  expect(result.connection).toBe(initialRaceState.connection);
});

test("bestLap tracks minimum timeSec", () => {
  let state = initialRaceState;
  state = reduce(state, makeLap(1, 95));
  state = reduce(state, makeLap(2, 90));
  state = reduce(state, makeLap(3, 92));

  expect(state.bestLap?.timeSec).toBe(90);
  expect(state.bestLap?.lap).toBe(2);
});

test("duplicate lap is idempotent", () => {
  const lap = makeLap(1, 90);
  const state1 = reduce(initialRaceState, lap);
  const state2 = reduce(state1, lap);

  expect(Object.keys(state2.laps)).toHaveLength(1);
  expect(state2.bestLap?.timeSec).toBe(90);
  expect(state2.recentLaps).toHaveLength(1);
});

test("sector best tracks minimum across laps", () => {
  let state = initialRaceState;
  state = reduce(state, makeLap(1, 90, [20, 25, 22, 23]));
  state = reduce(state, makeLap(2, 91, [22, 24, 21, 24]));

  expect(state.sectors[0]).toEqual({ last: 22, best: 20 });
  expect(state.sectors[1]).toEqual({ last: 24, best: 24 });
  expect(state.sectors[2]).toEqual({ last: 21, best: 21 });
  expect(state.sectors[3]).toEqual({ last: 24, best: 23 });
});

test("recentLaps caps at 8", () => {
  let state = initialRaceState;
  for (let i = 1; i <= 12; i++) {
    state = reduce(state, makeLap(i, 90 + i));
  }

  expect(state.recentLaps).toHaveLength(8);
  expect(state.recentLaps[0]?.lap).toBe(5);
  expect(state.recentLaps[7]?.lap).toBe(12);
});

test("tick does not mutate state", () => {
  const original = { ...initialRaceState };
  reduce(initialRaceState, makeTick());
  expect(initialRaceState.t).toBe(original.t);
  expect(initialRaceState.lat).toBe(original.lat);
});

test("lap does not mutate laps map", () => {
  const originalLaps = initialRaceState.laps;
  reduce(initialRaceState, makeLap(1, 90));
  expect(Object.keys(originalLaps)).toHaveLength(0);
});
