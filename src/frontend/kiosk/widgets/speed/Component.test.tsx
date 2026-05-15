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

test("speed 28.4 renders as 28 with text-yellow font-mono tabular-nums", async () => {
  mockState({ speed: 28.4 });
  const { SpeedComponent } = await import("./Component");
  render(<SpeedComponent />);
  const el = screen.getByText("28");
  expect(el.className).toContain("text-yellow");
  expect(el.className).toContain("font-mono");
  expect(el.className).toContain("tabular-nums");
});

test("speed null renders em-dash", async () => {
  mockState({ speed: null });
  const { SpeedComponent } = await import("./Component");
  render(<SpeedComponent />);
  const el = screen.getByText("—");
  expect(el).toBeTruthy();
});

test("panel header reads SPEED", async () => {
  mockState({ speed: 25 });
  const { SpeedComponent } = await import("./Component");
  render(<SpeedComponent />);
  expect(screen.getByText("SPEED")).toBeTruthy();
});

test("no bar history rendered when speedHistory is absent", async () => {
  mockState({ speed: 30 });
  const { SpeedComponent } = await import("./Component");
  const { container } = render(<SpeedComponent />);
  expect(container.querySelectorAll("canvas, svg").length).toBe(0);
});
