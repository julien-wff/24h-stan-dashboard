import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { bearingDegrees, haversineMeters, parseGpx, pointAtDistance } from "./gpx";

const TRACK_PATH = resolve(import.meta.dir, "../__fixtures__/track.gpx");

test("parseGpx produces ≥2 points with totalMeters > 0 (bundled file has 51 trkpt)", async () => {
  const polyline = await parseGpx(TRACK_PATH);
  expect(polyline.points.length).toBeGreaterThanOrEqual(2);
  expect(polyline.totalMeters).toBeGreaterThan(0);
});

test("pointAtDistance(0) matches the first point", async () => {
  const polyline = await parseGpx(TRACK_PATH);
  const [first] = polyline.points;
  if (!first) throw new Error("polyline has no points");
  const pt = pointAtDistance(polyline, 0);
  expect(pt.lat).toBeCloseTo(first.lat, 8);
  expect(pt.lon).toBeCloseTo(first.lon, 8);
});

test("pointAtDistance(totalMeters) wraps to first point within 1 m", async () => {
  const polyline = await parseGpx(TRACK_PATH);
  const [first] = polyline.points;
  if (!first) throw new Error("polyline has no points");
  const pt = pointAtDistance(polyline, polyline.totalMeters);
  const dist = haversineMeters(pt, first);
  expect(dist).toBeLessThan(1);
});

test("haversineMeters matches known value between two Paris-area coords", () => {
  // ~111 m per 0.001° latitude change
  const a = { lat: 48.0, lon: 2.0 };
  const b = { lat: 48.001, lon: 2.0 };
  const d = haversineMeters(a, b);
  // expected ~111.2 m
  expect(d).toBeGreaterThan(110);
  expect(d).toBeLessThan(113);
});

test("bearingDegrees due-north is ~0", () => {
  const a = { lat: 48.0, lon: 2.0 };
  const b = { lat: 48.01, lon: 2.0 };
  const bearing = bearingDegrees(a, b);
  expect(bearing).toBeCloseTo(0, 0);
});

test("bearingDegrees due-east is ~90", () => {
  const a = { lat: 48.0, lon: 2.0 };
  const b = { lat: 48.0, lon: 2.01 };
  const bearing = bearingDegrees(a, b);
  expect(bearing).toBeCloseTo(90, 0);
});

test("parseGpx throws with the path in the message for a missing file", async () => {
  const missing = "/nonexistent/path/to/track.gpx";
  await expect(parseGpx(missing)).rejects.toThrow(missing);
});
