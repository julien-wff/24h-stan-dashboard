import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadCenterline, SECTOR_BOUNDARIES_S } from "./centerline";

const TRACK_PATH = resolve(import.meta.dir, "../__fixtures__/track.gpx");

test("happy-path load produces totalMeters > 0 and at least 2 points", () => {
  const centerline = loadCenterline(TRACK_PATH);
  expect(centerline.totalMeters).toBeGreaterThan(0);
  expect(centerline.points.length).toBeGreaterThanOrEqual(2);
});

test("missing file throws synchronously with the absolute path in the message", () => {
  const missing = "/nonexistent/path/to/track.gpx";
  expect(() => loadCenterline(missing)).toThrow(missing);
});

test("file with fewer than two trkpt points throws", () => {
  const tmp = `${import.meta.dir}/only-one-point.gpx`;
  const content = `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="48.0" lon="2.0"/></trkseg></trk></gpx>`;
  require("node:fs").writeFileSync(tmp, content);
  try {
    expect(() => loadCenterline(tmp)).toThrow(tmp);
  } finally {
    require("node:fs").unlinkSync(tmp);
  }
});

test("project() of the first track point returns s ≈ 0 and sector === 0", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const first = centerline.points[0];
  if (!first) throw new Error("expected centerline points");
  const { s, sector } = centerline.project(first.lat, first.lon);
  expect(s).toBeCloseTo(0, 3);
  expect(sector).toBe(0);
});

test("project() returns sector 0 for s in [0, 0.25)", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const targetS = 0.1;
  const targetM = targetS * centerline.totalMeters;
  const pt = findPointAtS(centerline.points, targetM);
  const { sector } = centerline.project(pt.lat, pt.lon);
  expect(sector).toBe(0);
});

test("project() returns sector 1 for s in [0.25, 0.5)", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const targetM = SECTOR_BOUNDARIES_S[1] * centerline.totalMeters + 1;
  const pt = findPointAtS(centerline.points, targetM);
  const { sector } = centerline.project(pt.lat, pt.lon);
  expect(sector).toBe(1);
});

test("project() returns sector 2 for s in [0.5, 0.75)", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const targetM = SECTOR_BOUNDARIES_S[2] * centerline.totalMeters + 1;
  const pt = findPointAtS(centerline.points, targetM);
  const { sector } = centerline.project(pt.lat, pt.lon);
  expect(sector).toBe(2);
});

test("project() returns sector 3 for s in [0.75, 1.0)", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const targetM = SECTOR_BOUNDARIES_S[3] * centerline.totalMeters + 1;
  const pt = findPointAtS(centerline.points, targetM);
  const { sector } = centerline.project(pt.lat, pt.lon);
  expect(sector).toBe(3);
});

function findPointAtS(
  points: { lat: number; lon: number; cumulativeMeters: number }[],
  targetM: number,
): { lat: number; lon: number } {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    if (a.cumulativeMeters <= targetM && targetM <= b.cumulativeMeters) {
      const t = (targetM - a.cumulativeMeters) / (b.cumulativeMeters - a.cumulativeMeters);
      return {
        lat: a.lat + t * (b.lat - a.lat),
        lon: a.lon + t * (b.lon - a.lon),
      };
    }
  }
  const last = points[points.length - 1];
  if (!last) throw new Error("expected centerline points");
  return last;
}
