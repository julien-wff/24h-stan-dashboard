import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateTelemetryPacket } from "@shared/telemetry/packet";
import { haversineMeters, parseGpx, pointAtDistance } from "./gpx";
import type { SimulatorState } from "./resume-state";
import { loadResumeState } from "./resume-state";
import { SimulatorSource } from "./simulator";

const TRACK_PATH = resolve(import.meta.dir, "../__fixtures__/track.gpx");

const tmpDir = mkdtempSync(join(tmpdir(), "simulator-test-"));

beforeAll(async () => {});
afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeSource(opts?: { intervalMs?: number; resume?: SimulatorState }) {
  return new SimulatorSource(TRACK_PATH, opts?.intervalMs ?? 0, opts?.resume);
}

async function collectLines(source: SimulatorSource, count: number): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of source.lines()) {
    lines.push(line);
    if (lines.length >= count) {
      await source.stop();
      break;
    }
  }
  return lines;
}

test("simulator output is contract-valid for the first 50 lines", async () => {
  const source = makeSource();
  const lines = await collectLines(source, 50);
  expect(lines.length).toBe(50);
  for (const line of lines) {
    const parsed = JSON.parse(line);
    const result = validateTelemetryPacket(parsed);
    expect(result.ok).toBe(true);
  }
});

test("seq is monotonic with wrap allowed at 65535", async () => {
  const source = makeSource();
  const seqs: number[] = [];
  for await (const line of source.lines()) {
    const parsed = JSON.parse(line) as { seq: number };
    seqs.push(parsed.seq);
    if (seqs.length >= 100) {
      await source.stop();
      break;
    }
  }
  expect(seqs.length).toBe(100);
  for (let i = 1; i < seqs.length; i++) {
    const prev = seqs[i - 1];
    const curr = seqs[i];
    if (prev === undefined || curr === undefined) throw new Error("missing seq");
    const isMonotonic = curr === prev + 1 || (prev === 65535 && curr === 0);
    expect(isMonotonic).toBe(true);
  }
});

test("emitted positions stay on GPX polyline within 0.5 m", async () => {
  const polyline = await parseGpx(TRACK_PATH);
  const source = makeSource();
  const lines = await collectLines(source, 30);

  for (const line of lines) {
    const { lat, lon } = JSON.parse(line) as { lat: number; lon: number };
    // find nearest point by trying pointAtDistance — just verify by checking projection
    // We verify by checking min distance to any polyline segment
    let minDist = Infinity;
    for (let i = 0; i < polyline.points.length - 1; i++) {
      const a = polyline.points[i];
      const b = polyline.points[i + 1];
      if (!a || !b) continue;
      const segLen = haversineMeters(a, b);
      if (segLen === 0) continue;
      const da = haversineMeters({ lat, lon }, a);
      const db = haversineMeters({ lat, lon }, b);
      // minimum distance to segment = minimum of point-to-point or projected
      const tProjLat =
        ((lat - a.lat) * (b.lat - a.lat) + (lon - a.lon) * (b.lon - a.lon)) /
        ((b.lat - a.lat) ** 2 + (b.lon - a.lon) ** 2 || 1);
      const t = Math.max(0, Math.min(1, tProjLat));
      const projLat = a.lat + t * (b.lat - a.lat);
      const projLon = a.lon + t * (b.lon - a.lon);
      const d = haversineMeters({ lat, lon }, { lat: projLat, lon: projLon });
      minDist = Math.min(minDist, d, da, db);
    }
    expect(minDist).toBeLessThan(0.5);
  }
});

test("speed hovers around 15 km/h with small jitter", async () => {
  const source = makeSource();
  const speeds: number[] = [];
  for await (const line of source.lines()) {
    const { speed } = JSON.parse(line) as { speed: number };
    speeds.push(speed);
    if (speeds.length >= 60) {
      await source.stop();
      break;
    }
  }
  for (const speed of speeds) {
    expect(speed).toBeGreaterThanOrEqual(14);
    expect(speed).toBeLessThanOrEqual(16);
  }
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  expect(mean).toBeGreaterThanOrEqual(14.8);
  expect(mean).toBeLessThanOrEqual(15.2);
});

test("trajectory loops: position near start after totalMeters travelled", async () => {
  const polyline = await parseGpx(TRACK_PATH);
  // Create source and manually advance past totalMeters
  const source = new SimulatorSource(TRACK_PATH, 0);
  const lines: string[] = [];

  // Collect enough lines to exceed totalMeters: at ~4.17 m/tick, ~600m loop → ~145 ticks
  for await (const line of source.lines()) {
    lines.push(line);
    const dist = lines.length * (15 / 3.6);
    if (dist > polyline.totalMeters) {
      await source.stop();
      break;
    }
  }

  const lastLine = lines[lines.length - 1];
  const first = polyline.points[0];
  if (!lastLine || !first) throw new Error("expected at least one emitted line");
  const last = JSON.parse(lastLine) as { lat: number; lon: number };
  // After wrapping, position should be near start (within a few meters)
  const dist = haversineMeters(last, first);
  expect(dist).toBeLessThan(10); // near start of loop
});

test("missing GPX file throws with path in message", async () => {
  const missing = "/nonexistent/track.gpx";
  const source = new SimulatorSource(missing, 0);
  const consume = async () => {
    for await (const _ of source.lines()) {
      break;
    }
  };
  await expect(consume()).rejects.toThrow(missing);
});

test("resume restores progress when track path matches", async () => {
  const polyline = await parseGpx(TRACK_PATH);
  const resumeDistanceM = 200;
  const resumeSeq = 47;
  const source = new SimulatorSource(TRACK_PATH, 0, {
    kind: "simulator",
    trackPath: TRACK_PATH,
    distanceM: resumeDistanceM,
    elapsedSec: 48,
    seq: resumeSeq,
  });

  const lines = await collectLines(source, 1);
  const firstLine = lines[0];
  if (!firstLine) throw new Error("expected at least one emitted line");
  const { seq, lat, lon } = JSON.parse(firstLine) as { seq: number; lat: number; lon: number };
  expect(seq).toBe(resumeSeq + 1);

  const expectedPos = pointAtDistance(polyline, resumeDistanceM);
  const dist = haversineMeters({ lat, lon }, expectedPos);
  expect(dist).toBeLessThan(1);
});

test("resume is ignored when track path differs", async () => {
  const source = new SimulatorSource(TRACK_PATH, 0, {
    kind: "simulator",
    trackPath: "/different/track.gpx",
    distanceM: 500,
    elapsedSec: 120,
    seq: 119,
  });

  const lines = await collectLines(source, 1);
  const firstLine = lines[0];
  if (!firstLine) throw new Error("expected at least one emitted line");
  const { seq } = JSON.parse(firstLine) as { seq: number };
  expect(seq).toBe(0);
});

test("resume state is written to disk each tick (seq===2 persisted after 3rd tick runs)", async () => {
  const source = makeSource({ intervalMs: 1 }); // non-zero so distanceM advances
  // Collect 4 lines: after line[2] (seq=2) is yielded, the generator saves its state before
  // yielding line[3]; breaking at line[3] leaves seq=2 in the state file.
  await collectLines(source, 4);

  const state = await loadResumeState("data/simulator-state.json");
  expect(state).not.toBeUndefined();
  expect(state?.kind).toBe("simulator");
  if (state?.kind === "simulator") {
    expect(state.seq).toBe(2);
    expect(state.trackPath).toBe(TRACK_PATH);
    expect(state.distanceM).toBeGreaterThan(0);
  }
});

test("stop() halts emission", async () => {
  const source = makeSource();
  const lines: string[] = [];

  for await (const line of source.lines()) {
    lines.push(line);
    if (lines.length >= 5) {
      await source.stop();
    }
  }

  expect(lines.length).toBe(5);
});
