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

test("fill width is 47.3% when s=0.473", async () => {
  mockState({ s: 0.473 });
  const { LapProgressComponent } = await import("./Component");
  const { container } = render(<LapProgressComponent />);
  const fill = container.querySelector(".bg-yellow");
  expect(fill).toBeTruthy();
  expect((fill as HTMLElement | null)?.style.width).toBe("47.3%");
});

test("percentage element has font-mono tabular-nums text-text classes", async () => {
  mockState({ s: 0.5 });
  const { LapProgressComponent } = await import("./Component");
  render(<LapProgressComponent />);
  const pctEl = screen.getByText("50.0%");
  expect(pctEl.className).toContain("font-mono");
  expect(pctEl.className).toContain("tabular-nums");
  expect(pctEl.className).toContain("text-text");
});

test("lap-time element has font-mono tabular-nums text-yellow classes", async () => {
  mockState({
    s: 0.3,
    t: 1_734_000_065.5,
    laps: {
      1: {
        lap: 1,
        timeSec: 200,
        splits: [50, 50, 50, 50],
        startedAt: 1_733_999_800_000,
        endedAt: 1_734_000_000_000,
      },
    },
  });
  const { LapProgressComponent } = await import("./Component");
  render(<LapProgressComponent />);
  const lapEl = screen.getByText("1:05.50");
  expect(lapEl.className).toContain("font-mono");
  expect(lapEl.className).toContain("tabular-nums");
  expect(lapEl.className).toContain("text-yellow");
});

test("null state renders 0% fill and em-dash lap time", async () => {
  mockState({ s: null, t: null });
  const { LapProgressComponent } = await import("./Component");
  const { container } = render(<LapProgressComponent />);
  const fill = container.querySelector(".bg-yellow");
  expect((fill as HTMLElement | null)?.style.width).toBe("0%");
  expect(screen.getByText("—:——")).toBeTruthy();
});
