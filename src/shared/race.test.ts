import { afterEach, beforeEach, expect, test } from "bun:test";
import { getRaceStartUnixSec } from "./race";

const DEFAULT_UNIX = new Date("2026-05-23T16:00:00+02:00").getTime() / 1000;

beforeEach(() => {
  delete process.env.RACE_START_AT;
});

afterEach(() => {
  delete process.env.RACE_START_AT;
});

test("default is 2026-05-23T16:00:00+02:00 when env is unset", () => {
  expect(getRaceStartUnixSec()).toBe(DEFAULT_UNIX);
});

test("custom value is honored", () => {
  process.env.RACE_START_AT = "2026-06-01T10:00:00Z";
  expect(getRaceStartUnixSec()).toBe(new Date("2026-06-01T10:00:00Z").getTime() / 1000);
});

test("malformed value throws with the offending value in the message", () => {
  process.env.RACE_START_AT = "not-a-date";
  expect(() => getRaceStartUnixSec()).toThrow("not-a-date");
});
