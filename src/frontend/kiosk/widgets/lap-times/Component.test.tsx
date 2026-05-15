import { afterEach, expect, mock, test } from "bun:test";
import type { Lap, RaceState } from "@frontend/kiosk/state/types";
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

const makeLap = (lap: number, timeSec: number): Lap => ({
  lap,
  timeSec,
  splits: [timeSec / 4, timeSec / 4, timeSec / 4, timeSec / 4],
  startedAt: 0,
  endedAt: timeSec,
});

test("best lap row is highlighted in text-purple with BEST chip", async () => {
  const best = makeLap(12, 88.34);
  mockState({
    bestLap: best,
    laps: { 12: best },
    recentLaps: [best],
  });
  const { LapTimesComponent } = await import("./Component");
  render(<LapTimesComponent />);
  // In list region, the best lap row should have text-purple time
  const allTimes = screen.getAllByText("1:28.34");
  const purpleTime = allTimes.find((el) => el.className.includes("text-purple"));
  expect(purpleTime).toBeTruthy();
  // BEST chip should exist and be text-purple
  const bestChip = screen.getByText("BEST");
  expect(bestChip.className).toContain("text-purple");
});

test("last lap value uses text-yellow in summary", async () => {
  const lap = makeLap(5, 91.5);
  mockState({
    bestLap: lap,
    laps: { 5: lap },
    recentLaps: [lap],
  });
  const { LapTimesComponent } = await import("./Component");
  render(<LapTimesComponent />);
  // The LAST LAP summary value should be yellow
  const allTimes = screen.getAllByText("1:31.50");
  const yellowTime = allTimes.find((el) => el.className.includes("text-yellow"));
  expect(yellowTime).toBeTruthy();
});

test("empty state renders two em-dash placeholders and no list rows", async () => {
  mockState({ bestLap: null, laps: {}, recentLaps: [] });
  const { LapTimesComponent } = await import("./Component");
  render(<LapTimesComponent />);
  const dashes = screen.getAllByText("—:——");
  expect(dashes.length).toBe(2);
  // No lap rows (no L<N> elements beyond the header chip L0)
  const lapLabels = screen.queryAllByText(/^L\d+$/);
  expect(lapLabels.length).toBeLessThanOrEqual(1);
});
