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

test("renders four sector names in order", async () => {
  mockState({});
  const { SectorComponent } = await import("./Component");
  const { container } = render(<SectorComponent />);
  const text = container.textContent ?? "";
  const s1 = text.indexOf("S1 · LIGNE DROITE EST");
  const s2 = text.indexOf("S2 · VIRAGE NORD");
  const s3 = text.indexOf("S3 · LIGNE DROITE OUEST");
  const s4 = text.indexOf("S4 · VIRAGE SUD");
  expect(s1).toBeGreaterThan(-1);
  expect(s2).toBeGreaterThan(s1);
  expect(s3).toBeGreaterThan(s2);
  expect(s4).toBeGreaterThan(s3);
});

test("active sector row (sector=2) has bg-yellow indicator and text-text name", async () => {
  mockState({ sector: 2 });
  const { SectorComponent } = await import("./Component");
  const { container } = render(<SectorComponent />);
  // Find rows by looking for the container divs
  const rows = container.querySelectorAll(".flex.items-center.gap-3\\.5");
  const activeRow = rows[2];
  expect(activeRow).toBeTruthy();
  const indicator = activeRow?.firstElementChild;
  expect(indicator?.className).toContain("bg-yellow");
  const nameEl = activeRow?.children[1];
  expect(nameEl?.className).toContain("text-text");
  expect(nameEl?.className).not.toContain("text-text-dim");
});

test("last === best renders sector time in text-purple", async () => {
  mockState({
    sectors: [
      { last: 22.34, best: 22.34 },
      { last: null, best: null },
      { last: null, best: null },
      { last: null, best: null },
    ],
  });
  const { SectorComponent } = await import("./Component");
  render(<SectorComponent />);
  const el = screen.getByText("0:22.34");
  expect(el.className).toContain("text-purple");
});

test("null last renders — placeholder", async () => {
  mockState({});
  const { SectorComponent } = await import("./Component");
  render(<SectorComponent />);
  const dashes = screen.getAllByText("—:——");
  expect(dashes.length).toBe(4);
});
