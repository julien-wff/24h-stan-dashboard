import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { validateTelemetryPacket } from "../../../shared/telemetry/packet";
import { FixtureSource } from "./fixture";

const FIXTURE_PATH = resolve(import.meta.dir, "../__fixtures__/sample-session.ndjson");

test("every fixture line is contract-valid", async () => {
  const source = new FixtureSource(FIXTURE_PATH);
  let count = 0;

  for await (const line of source.lines()) {
    const parsed = JSON.parse(line);
    const result = validateTelemetryPacket(parsed);
    expect(result.ok).toBe(true);
    count++;
  }

  expect(count).toBeGreaterThanOrEqual(20);
});

test("FixtureSource yields lines in file order with matching count", async () => {
  const text = await Bun.file(FIXTURE_PATH).text();
  const fileLines = text.split("\n").filter((l) => l.trim());

  const source = new FixtureSource(FIXTURE_PATH);
  const yielded: string[] = [];

  for await (const line of source.lines()) {
    yielded.push(line);
  }

  expect(yielded.length).toBe(fileLines.length);
  for (let i = 0; i < fileLines.length; i++) {
    expect(yielded[i]).toBe(fileLines[i]);
  }
});
