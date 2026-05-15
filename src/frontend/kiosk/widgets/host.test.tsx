import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { Layout } from "./types";

const makeLayout = (overrides: Partial<Layout> = {}): Layout => ({
  topbar: "topbar",
  grid: {
    columns: "1fr",
    rows: "1fr",
    areas: ["slot-a"],
    gap: 0,
    padding: 0,
  },
  slots: { "slot-a": "widget-a" },
  ...overrides,
});

// We mock the registry so validateLayout sees a controlled widgetsById
beforeEach(() => {
  mock.module("./registry", () => ({
    widgets: [
      { id: "topbar", Component: () => null },
      { id: "widget-a", Component: () => null },
    ],
    widgetsById: {
      topbar: { id: "topbar", Component: () => null },
      "widget-a": { id: "widget-a", Component: () => null },
    },
  }));
});

afterEach(() => {
  mock.restore();
});

test("validateLayout happy path does not throw", async () => {
  const { validateLayout } = await import("./host");
  expect(() => validateLayout(makeLayout())).not.toThrow();
});

test("validateLayout throws when area token is not in slots", async () => {
  const { validateLayout } = await import("./host");
  const layout = makeLayout({
    grid: { columns: "1fr", rows: "1fr", areas: ["map"], gap: 0, padding: 0 },
    slots: {},
  });
  expect(() => validateLayout(layout)).toThrow(/area "map"/);
});

test("validateLayout throws when slot widget id is not in registry", async () => {
  const { validateLayout } = await import("./host");
  const layout = makeLayout({
    slots: { "slot-a": "speed-extreme" },
  });
  expect(() => validateLayout(layout)).toThrow(/unknown widget id/);
});

test("validateLayout throws when slot is not referenced in any area", async () => {
  const { validateLayout } = await import("./host");
  const layout = makeLayout({
    slots: { "slot-a": "widget-a", weather: "widget-a" },
  });
  expect(() => validateLayout(layout)).toThrow(/not referenced/);
});
