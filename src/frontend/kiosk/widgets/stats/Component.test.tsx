import { afterEach, expect, mock, test } from "bun:test";
import type { RaceState } from "@frontend/kiosk/state/types";
import { initialRaceState } from "@frontend/kiosk/state/types";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(() => {
  mock.restore();
  cleanup();
});

function mockState(overrides: Partial<RaceState>) {
  mock.module("@frontend/kiosk/state/store", () => ({
    useRaceState: () => ({ ...initialRaceState, ...overrides }),
  }));
}

test("renders all five row labels in order", async () => {
  mockState({});
  const { StatsComponent } = await import("./Component");
  const { container } = render(<StatsComponent />);
  const text = container.textContent ?? "";
  const distIdx = text.indexOf("DISTANCE");
  const avgIdx = text.indexOf("AVG SPEED");
  const topIdx = text.indexOf("TOP SPEED");
  const calIdx = text.indexOf("CALORIES");
  const pitIdx = text.indexOf("PIT STOPS");
  expect(distIdx).toBeGreaterThan(-1);
  expect(avgIdx).toBeGreaterThan(distIdx);
  expect(topIdx).toBeGreaterThan(avgIdx);
  expect(calIdx).toBeGreaterThan(topIdx);
  expect(pitIdx).toBeGreaterThan(calIdx);
});

test("top speed value has text-green class", async () => {
  mock.module("@frontend/kiosk/state/store", () => ({
    useRaceState: () => ({ ...initialRaceState, topSpeed: 32.7 }),
  }));
  const { StatsComponent } = await import("./Component");
  render(<StatsComponent />);
  const el = screen.getByText("32.7 km/h");
  expect(el.className).toContain("text-green");
});

test("all rows render em-dash when source fields absent", async () => {
  mockState({});
  const { StatsComponent } = await import("./Component");
  render(<StatsComponent />);
  const dashes = screen.getAllByText("—");
  expect(dashes.length).toBeGreaterThanOrEqual(4);
});
