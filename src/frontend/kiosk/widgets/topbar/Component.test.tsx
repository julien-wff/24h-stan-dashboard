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

test("elapsed 3725 renders as 1:02:05", async () => {
  mockState({ elapsed: 3725 });
  const { TopbarComponent } = await import("./Component");
  render(<TopbarComponent />);
  expect(screen.getByText("1:02:05")).toBeTruthy();
});

test("highest lap 7 renders as 007", async () => {
  mockState({
    laps: {
      1: { lap: 1, timeSec: 90, splits: [22, 23, 22, 23], startedAt: 0, endedAt: 90 },
      7: { lap: 7, timeSec: 88, splits: [22, 22, 22, 22], startedAt: 540, endedAt: 628 },
    },
  });
  const { TopbarComponent } = await import("./Component");
  render(<TopbarComponent />);
  expect(screen.getByText("007")).toBeTruthy();
});

test("empty laps renders 000", async () => {
  mockState({ laps: {} });
  const { TopbarComponent } = await import("./Component");
  render(<TopbarComponent />);
  expect(screen.getByText("000")).toBeTruthy();
});

test("absent sensor fields fall back to —", async () => {
  mockState({});
  const { TopbarComponent } = await import("./Component");
  render(<TopbarComponent />);
  const dashes = screen.getAllByText("—");
  expect(dashes.length).toBeGreaterThanOrEqual(1);
});

test("lap numeral has text-yellow font-mono tabular-nums classes", async () => {
  mockState({
    laps: {
      3: { lap: 3, timeSec: 90, splits: [22, 23, 22, 23], startedAt: 0, endedAt: 90 },
    },
  });
  const { TopbarComponent } = await import("./Component");
  render(<TopbarComponent />);
  const lapEl = screen.getByText("003");
  expect(lapEl.className).toContain("text-yellow");
  expect(lapEl.className).toContain("font-mono");
  expect(lapEl.className).toContain("tabular-nums");
});
