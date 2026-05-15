import { beforeEach, expect, test } from "bun:test";
import type { RaceUpdate } from "@shared/wire/race-update";
import { dispatch, getSnapshot, resetState, setConnection, subscribe } from "./store";

function makeTick(): RaceUpdate {
  return {
    type: "tick",
    t: 1,
    elapsed: 0,
    lat: 0,
    lon: 0,
    heading: 0,
    speed: 0,
    s: 0,
    sector: 0,
  };
}

beforeEach(() => {
  resetState();
});

test("subscribe receives notifications on dispatch", () => {
  let callCount = 0;
  const unsub = subscribe(() => callCount++);
  dispatch(makeTick());
  unsub();
  expect(callCount).toBeGreaterThanOrEqual(1);
  expect(getSnapshot().t).toBe(1);
});

test("unsubscribe stops notifications", () => {
  let callCount = 0;
  const unsub = subscribe(() => callCount++);
  unsub();
  dispatch(makeTick());
  expect(callCount).toBe(0);
});

test("setConnection allocates a new state object", () => {
  const before = getSnapshot();
  expect(before.connection).toBe("connecting");
  setConnection("open");
  const after = getSnapshot();
  expect(after).not.toBe(before);
  expect(after.connection).toBe("open");
  expect(after.laps).toBe(before.laps);
});

test("resetState returns to initialRaceState shape", () => {
  dispatch(makeTick());
  expect(getSnapshot().t).toBe(1);
  resetState();
  expect(getSnapshot().t).toBeNull();
  expect(getSnapshot().connection).toBe("connecting");
});

test("setConnection notifies listeners", () => {
  let callCount = 0;
  const unsub = subscribe(() => callCount++);
  setConnection("closed");
  unsub();
  expect(callCount).toBe(1);
});
