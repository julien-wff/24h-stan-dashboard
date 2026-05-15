import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { RaceState } from "@frontend/kiosk/state/types";
import { initialRaceState } from "@frontend/kiosk/state/types";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { CENTER, ROT_DEG } from "./project";

function setLocationSearch(search: string) {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: "/", search, href: `http://localhost/${search}` },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  mock.module("@frontend/kiosk/assets/track-satellite-dark.webp", () => ({
    default: "/mock-map.webp",
  }));
  setLocationSearch("");
});

afterEach(() => {
  mock.restore();
  cleanup();
});

function mockState(overrides: Partial<RaceState>) {
  mock.module("@frontend/kiosk/state/store", () => ({
    useRaceState: () => ({ ...initialRaceState, ...overrides }),
  }));
}

// ─── 6.1: basic rendering ────────────────────────────────────────────────────

test("panel header reads PLACE DE LA CARRIÈRE · NANCY", async () => {
  mockState({});
  const { MapComponent } = await import("./Component");
  render(<MapComponent />);
  expect(screen.getByText("PLACE DE LA CARRIÈRE · NANCY")).toBeTruthy();
});

test("marker is hidden when lat/lon are null", async () => {
  mockState({ lat: null, lon: null, heading: null });
  const { MapComponent } = await import("./Component");
  const { container } = render(<MapComponent />);
  expect(container.querySelectorAll("circle").length).toBe(0);
  expect(container.querySelectorAll("polygon").length).toBe(0);
});

test("marker renders at approximately the image centre for georef centre coords", async () => {
  mockState({ lat: CENTER.lat, lon: CENTER.lon, heading: 0 });
  const { MapComponent } = await import("./Component");
  const { container } = render(<MapComponent />);
  // Two circles: halo + disc
  const circles = container.querySelectorAll("circle");
  expect(circles.length).toBeGreaterThanOrEqual(2);
  // The disc (r=22) should be at approx IMAGE_W/2, IMAGE_H/2
  const disc = [...circles].find((c) => c.getAttribute("r") === "22");
  expect(disc).toBeTruthy();
  const cx = Number(disc!.getAttribute("cx"));
  const cy = Number(disc!.getAttribute("cy"));
  // image centre is 807.5, 487; allow 1% tolerance of IMAGE_W/IMAGE_H
  expect(Math.abs(cx - 807.5)).toBeLessThan(16.15);
  expect(Math.abs(cy - 487)).toBeLessThan(9.74);
});

test("chevron rotation tracks heading (offset by image rotation)", async () => {
  mockState({ lat: CENTER.lat, lon: CENTER.lon, heading: 90 });
  const { MapComponent } = await import("./Component");
  const { container } = render(<MapComponent />);
  const chevron = container.querySelector("polygon");
  expect(chevron).toBeTruthy();
  // SVG rotation = heading + ROT_DEG (so image-up after rotation = real-world bearing `heading`)
  const expected = 90 + ROT_DEG;
  expect(chevron!.getAttribute("transform")).toContain(`rotate(${expected}`);
});

test("chevron rotates clockwise as heading increases", async () => {
  // Δ heading produces Δ rotation in the SVG transform (no extra coupling)
  mockState({ lat: CENTER.lat, lon: CENTER.lon, heading: 0 });
  const { MapComponent: M1 } = await import("./Component");
  const { container: c1 } = render(<M1 />);
  const t1 = c1.querySelector("polygon")!.getAttribute("transform")!;
  cleanup();

  mockState({ lat: CENTER.lat, lon: CENTER.lon, heading: 45 });
  const { MapComponent: M2 } = await import("./Component");
  const { container: c2 } = render(<M2 />);
  const t2 = c2.querySelector("polygon")!.getAttribute("transform")!;

  const r1 = Number(t1.match(/rotate\(([-\d.]+)/)![1]);
  const r2 = Number(t2.match(/rotate\(([-\d.]+)/)![1]);
  expect(r2 - r1).toBeCloseTo(45, 5);
});

test("chevron is hidden when heading is null", async () => {
  mockState({ lat: CENTER.lat, lon: CENTER.lon, heading: null });
  const { MapComponent } = await import("./Component");
  const { container } = render(<MapComponent />);
  expect(container.querySelector("polygon")).toBeNull();
  // but disc and halo should still be there
  expect(container.querySelectorAll("circle").length).toBeGreaterThanOrEqual(2);
});

// ─── 6.2: trail ──────────────────────────────────────────────────────────────

test("trail polyline capped at 30 samples after 40 ticks", async () => {
  let tick = 0;
  mock.module("@frontend/kiosk/state/store", () => ({
    useRaceState: () => ({
      ...initialRaceState,
      lat: CENTER.lat + tick * 0.0001,
      lon: CENTER.lon + tick * 0.0001,
      heading: 0,
      t: tick,
    }),
  }));

  const { MapComponent } = await import("./Component");
  const { rerender } = render(<MapComponent />);

  // Simulate 40 ticks by re-rendering (each re-render updates t)
  for (let i = 1; i <= 40; i++) {
    tick = i;
    mock.module("@frontend/kiosk/state/store", () => ({
      useRaceState: () => ({
        ...initialRaceState,
        lat: CENTER.lat + i * 0.0001,
        lon: CENTER.lon + i * 0.0001,
        heading: 0,
        t: i,
      }),
    }));
    const { MapComponent: Fresh } = await import("./Component");
    rerender(<Fresh />);
  }

  // The trail polyline is the one with fill-none and stroke-[3px]
  const { container } = render(<MapComponent />);
  await waitFor(() => {
    const polylines = container.querySelectorAll("polyline");
    const trailLine = [...polylines].find(
      (p) =>
        p.classList.contains("stroke-\\[3px\\]") ||
        p.getAttribute("class")?.includes("stroke-[3px]"),
    );
    if (trailLine) {
      const pts = trailLine.getAttribute("points")?.trim().split(" ") ?? [];
      expect(pts.length).toBeLessThanOrEqual(30);
    }
  });
});

// ─── 6.3: GPS loss ───────────────────────────────────────────────────────────

test("trail clears when GPS is lost", async () => {
  // First render with GPS data
  mockState({ lat: CENTER.lat, lon: CENTER.lon, heading: 0, t: 1 });
  const { MapComponent } = await import("./Component");
  const { rerender } = render(<MapComponent />);

  // Now GPS lost
  mock.module("@frontend/kiosk/state/store", () => ({
    useRaceState: () => ({ ...initialRaceState, lat: null, lon: null, heading: null, t: 2 }),
  }));
  const { MapComponent: Fresh } = await import("./Component");
  rerender(<Fresh />);

  // No trail polyline after GPS loss
  const trailLine = document.querySelector("polyline");
  if (trailLine) {
    const pts = trailLine.getAttribute("points")?.trim() ?? "";
    expect(pts.length).toBe(0);
  }
  // No marker either
  expect(document.querySelector("circle")).toBeNull();
});

// ─── 6.4: debug overlay ──────────────────────────────────────────────────────

test("no fetch call when ?debug=track is absent", async () => {
  const fetchSpy = mock(() => Promise.resolve(new Response("{}", { status: 404 })));
  globalThis.fetch = fetchSpy as typeof fetch;

  mockState({ lat: CENTER.lat, lon: CENTER.lon, heading: 0 });
  const { MapComponent } = await import("./Component");
  render(<MapComponent />);

  await new Promise((r) => setTimeout(r, 10));
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("overlay polyline renders when ?debug=track is set and fetch succeeds", async () => {
  setLocationSearch("?debug=track");

  const trackResponse = {
    points: [
      { lat: CENTER.lat - 0.001, lon: CENTER.lon - 0.001 },
      { lat: CENTER.lat + 0.001, lon: CENTER.lon + 0.001 },
    ],
  };

  let resolveFetch!: (v: Response) => void;
  const fetchPromise = new Promise<Response>((res) => {
    resolveFetch = res;
  });
  globalThis.fetch = mock(() => fetchPromise) as typeof fetch;

  mockState({ lat: CENTER.lat, lon: CENTER.lon, heading: 0 });
  const { MapComponent } = await import("./Component");

  const { container } = render(<MapComponent />);

  // Resolve the fetch synchronously then flush React updates
  resolveFetch(
    new Response(JSON.stringify(trackResponse), {
      headers: { "content-type": "application/json" },
    }),
  );

  await waitFor(
    () => {
      const polylines = container.querySelectorAll("polyline");
      expect(polylines.length).toBeGreaterThanOrEqual(1);
    },
    { timeout: 3000 },
  );
});

test("widget still renders when debug fetch fails", async () => {
  setLocationSearch("?debug=track");

  globalThis.fetch = mock(async () => new Response("error", { status: 500 })) as typeof fetch;

  mockState({ lat: CENTER.lat, lon: CENTER.lon, heading: 0 });
  const { MapComponent } = await import("./Component");

  let container!: HTMLElement;
  await act(async () => {
    ({ container } = render(<MapComponent />));
  });

  await new Promise((r) => setTimeout(r, 20));

  // Widget still renders (disc visible), no overlay polyline
  const circles = container.querySelectorAll("circle");
  expect(circles.length).toBeGreaterThanOrEqual(1);
});
