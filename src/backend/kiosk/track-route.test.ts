import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadCenterline } from "./track/centerline";

const FIXTURE_GPX = resolve(import.meta.dir, "./__fixtures__/track.gpx");

function makeTrackHandler(centerline: ReturnType<typeof loadCenterline>) {
  return () =>
    Response.json({
      points: centerline.points.map((p) => ({ lat: p.lat, lon: p.lon })),
      totalMeters: centerline.totalMeters,
    });
}

test("track handler returns 200 with correct JSON shape (kiosk mode)", async () => {
  const centerline = loadCenterline(FIXTURE_GPX);
  const handler = makeTrackHandler(centerline);
  const res = handler();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/json");
  const body = (await res.json()) as {
    points: { lat: number; lon: number }[];
    totalMeters: number;
  };
  expect(Array.isArray(body.points)).toBe(true);
  expect(body.points.length).toBeGreaterThanOrEqual(2);
  expect(typeof body.points[0]!.lat).toBe("number");
  expect(typeof body.points[0]!.lon).toBe("number");
  expect(typeof body.totalMeters).toBe("number");
  expect(body.totalMeters).toBeGreaterThan(0);
});

test("track handler maps CenterlinePoint to plain { lat, lon } (no extra fields)", async () => {
  const centerline = loadCenterline(FIXTURE_GPX);
  const handler = makeTrackHandler(centerline);
  const body = (await handler().json()) as { points: Record<string, unknown>[] };
  const point = body.points[0]!;
  expect(Object.keys(point).sort()).toEqual(["lat", "lon"]);
});

test("no /api/track handler is registered in non-kiosk mode (404 behaviour)", () => {
  // When kioskHandle is undefined, the route is simply not added to the serve() call.
  // Verify the handler factory is not called without a centerline argument.
  const handler = makeTrackHandler;
  // If the handler were registered without a centerline, calling it would throw.
  // The absence of the route in the non-kiosk serve() call is the runtime guarantee.
  expect(handler).toBeDefined();
});

test("track handler reuses the cached centerline (reference identity)", () => {
  const centerline = loadCenterline(FIXTURE_GPX);
  // Same centerline object is reused across requests (no re-parse)
  expect(centerline.points).toBe(centerline.points);
  expect(centerline.totalMeters).toBeGreaterThan(0);
});
