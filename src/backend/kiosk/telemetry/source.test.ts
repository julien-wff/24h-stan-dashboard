import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { FixtureSource } from "./fixture";
import { SimulatorSource } from "./simulator";
import { resolveTelemetrySource } from "./source";

test("resolveTelemetrySource returns a SimulatorSource for 'simulated'", () => {
  const source = resolveTelemetrySource("simulated");
  expect(source).toBeInstanceOf(SimulatorSource);
});

test("resolveTelemetrySource defaults to simulator on empty input", () => {
  const source = resolveTelemetrySource("");
  expect(source).toBeInstanceOf(SimulatorSource);
});

test("resolveTelemetrySource returns a FixtureSource for 'fixture'", () => {
  const source = resolveTelemetrySource("fixture");
  expect(source).toBeInstanceOf(FixtureSource);
});

test("resolveTelemetrySource returns a FixtureSource for 'fixture:<path>'", () => {
  const source = resolveTelemetrySource("fixture:/tmp/custom.ndjson");
  expect(source).toBeInstanceOf(FixtureSource);
});

test("resolveTelemetrySource throws on empty fixture path", () => {
  expect(() => resolveTelemetrySource("fixture:")).toThrow(/fixture path is missing/i);
});

test("resolveTelemetrySource throws 'not yet implemented' for /dev/ttyUSB0", () => {
  expect(() => resolveTelemetrySource("/dev/ttyUSB0")).toThrow(/not yet implemented/i);
});

test("resolveTelemetrySource throws naming the value for unknown inputs", () => {
  expect(() => resolveTelemetrySource("bluetooth")).toThrow("bluetooth");
});

test("ingest.ts does not import concrete sources", () => {
  const ingestSource = readFileSync(new URL("../ingest.ts", import.meta.url).pathname, "utf-8");
  expect(ingestSource).not.toContain("SimulatorSource");
  expect(ingestSource).not.toContain("FixtureSource");
});
