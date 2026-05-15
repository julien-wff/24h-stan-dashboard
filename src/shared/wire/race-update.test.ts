import { expect, test } from "bun:test";
import { raceUpdateSchema } from "./race-update";

test("valid tick parse succeeds", () => {
  const result = raceUpdateSchema.safeParse({
    type: "tick",
    t: 1,
    elapsed: 0,
    lat: 48,
    lon: 6,
    heading: 90,
    speed: 15,
    s: 0.5,
    sector: 1,
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.type).toBe("tick");
  }
});

test("valid lap parse succeeds", () => {
  const result = raceUpdateSchema.safeParse({
    type: "lap",
    lap: 1,
    timeSec: 90,
    splits: [22.5, 22.5, 22.5, 22.5],
    startedAt: 1000,
    endedAt: 91000,
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.type).toBe("lap");
  }
});

test("unknown discriminator is rejected", () => {
  const result = raceUpdateSchema.safeParse({ type: "sample", lat: 48 });
  expect(result.success).toBe(false);
});
