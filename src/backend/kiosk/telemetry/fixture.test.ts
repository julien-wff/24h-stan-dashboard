import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { validateTelemetryPacket } from "@shared/telemetry/packet";
import { FixtureSource } from "./fixture";
import { loadResumeState } from "./resume-state";

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

test("resume restores position when path matches", async () => {
  const text = await Bun.file(FIXTURE_PATH).text();
  const fileLines = text.split("\n").filter((l) => l.trim());
  const resumeIndex = 5;

  const source = new FixtureSource(FIXTURE_PATH, {
    kind: "fixture",
    path: FIXTURE_PATH,
    lineIndex: resumeIndex,
    seq: resumeIndex,
  });

  const yielded: string[] = [];
  for await (const line of source.lines()) {
    yielded.push(line);
  }

  expect(yielded[0]).toBe(fileLines[resumeIndex]);
  expect(yielded.length).toBe(fileLines.length - resumeIndex);
});

test("resume is ignored when path differs", async () => {
  const source = new FixtureSource(FIXTURE_PATH, {
    kind: "fixture",
    path: "/different/path.ndjson",
    lineIndex: 10,
    seq: 10,
  });

  const yielded: string[] = [];
  for await (const line of source.lines()) {
    yielded.push(line);
  }

  const text = await Bun.file(FIXTURE_PATH).text();
  const fileLines = text.split("\n").filter((l) => l.trim());
  expect(yielded.length).toBe(fileLines.length);
});

test("resume is ignored when file is shorter than recorded index", async () => {
  const text = await Bun.file(FIXTURE_PATH).text();
  const fileLines = text.split("\n").filter((l) => l.trim());

  const source = new FixtureSource(FIXTURE_PATH, {
    kind: "fixture",
    path: FIXTURE_PATH,
    lineIndex: 9999,
    seq: 9999,
  });

  const yielded: string[] = [];
  for await (const line of source.lines()) {
    yielded.push(line);
  }

  expect(yielded.length).toBe(fileLines.length);
});

test("FixtureSource writes resume state per yielded line (lineIndex===2 persisted after 3rd yield runs)", async () => {
  const source = new FixtureSource(FIXTURE_PATH);
  let count = 0;
  // Collect 4 lines: after index 2 is yielded and state saved, line 3 is yielded and we break.
  for await (const _line of source.lines()) {
    count++;
    if (count >= 4) break;
  }

  const state = await loadResumeState("data/simulator-state.json");
  expect(state).not.toBeUndefined();
  expect(state?.kind).toBe("fixture");
  if (state?.kind === "fixture") {
    expect(state.path).toBe(FIXTURE_PATH);
    expect(state.lineIndex).toBe(2);
  }
});
