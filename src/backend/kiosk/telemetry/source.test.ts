import { expect, test } from "bun:test";
import { SimulatorSource } from "./simulator";
import { resolveTelemetrySource } from "./source";

test("resolveTelemetrySource returns a SimulatorSource for 'simulated'", () => {
  const source = resolveTelemetrySource("simulated");
  expect(source).toBeInstanceOf(SimulatorSource);
});

test("resolveTelemetrySource throws 'not yet implemented' for /dev/ttyUSB0", () => {
  expect(() => resolveTelemetrySource("/dev/ttyUSB0")).toThrow(/not yet implemented/i);
});

test("resolveTelemetrySource throws naming the value for unknown inputs", () => {
  expect(() => resolveTelemetrySource("bluetooth")).toThrow("bluetooth");
});
