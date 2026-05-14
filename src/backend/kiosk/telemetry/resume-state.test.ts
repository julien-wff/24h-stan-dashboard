import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FixtureState, SimulatorState } from "./resume-state";
import { loadResumeState, saveResumeState } from "./resume-state";

const tmpDir = mkdtempSync(join(tmpdir(), "resume-state-test-"));

afterEach(() => {
  // clean up any written files but keep the dir
});

function tmpPath(name: string) {
  return join(tmpDir, name);
}

test("round-trip simulator state", async () => {
  const path = tmpPath("sim.json");
  const state: SimulatorState = {
    kind: "simulator",
    trackPath: "/some/track.gpx",
    distanceM: 123.4,
    elapsedSec: 30,
    seq: 29,
  };
  await saveResumeState(state, path);
  const loaded = await loadResumeState(path);
  expect(loaded).toEqual(state);
});

test("round-trip fixture state", async () => {
  const path = tmpPath("fix.json");
  const state: FixtureState = {
    kind: "fixture",
    path: "/some/fixture.ndjson",
    lineIndex: 7,
    seq: 7,
  };
  await saveResumeState(state, path);
  const loaded = await loadResumeState(path);
  expect(loaded).toEqual(state);
});

test("missing file returns undefined", async () => {
  const result = await loadResumeState(tmpPath("nonexistent-file.json"));
  expect(result).toBeUndefined();
});

test("malformed JSON returns undefined", async () => {
  const path = tmpPath("malformed.json");
  await Bun.write(path, "{not valid json");
  const result = await loadResumeState(path);
  expect(result).toBeUndefined();
});

test("shape mismatch returns undefined", async () => {
  const path = tmpPath("mismatch.json");
  await Bun.write(path, JSON.stringify({ kind: "unknown", foo: "bar" }));
  const result = await loadResumeState(path);
  expect(result).toBeUndefined();
});

test("saveResumeState creates parent directory if missing", async () => {
  const nested = join(tmpDir, "deep", "nested", "state.json");
  const state: SimulatorState = {
    kind: "simulator",
    trackPath: "/gpx",
    distanceM: 0,
    elapsedSec: 0,
    seq: 0,
  };
  await saveResumeState(state, nested);
  const loaded = await loadResumeState(nested);
  expect(loaded).toEqual(state);
});

// cleanup
rmSync(tmpDir, { recursive: true, force: true });
