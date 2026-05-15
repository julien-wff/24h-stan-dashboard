import { afterEach, expect, mock, test } from "bun:test";
import { defaultLayout } from "./default";

afterEach(() => {
  mock.restore();
});

test("validateLayout throws when registry is empty (validator runs)", async () => {
  mock.module("../registry", () => ({
    widgets: [],
    widgetsById: {},
  }));
  const { validateLayout } = await import("../host");
  expect(() => validateLayout(defaultLayout)).toThrow();
});

test("validateLayout passes once the registry is populated", async () => {
  const allIds = [
    "topbar",
    "speed",
    "velocity",
    "stats",
    "map",
    "lap-progress",
    "sector",
    "lap-times",
    "weather",
    "latest-events",
  ];
  mock.module("../registry", () => ({
    widgets: allIds.map((id) => ({ id, Component: () => null })),
    widgetsById: Object.fromEntries(allIds.map((id) => [id, { id, Component: () => null }])),
  }));
  const { validateLayout } = await import("../host");
  expect(() => validateLayout(defaultLayout)).not.toThrow();
});

test("sorted slot keys equal the documented list", () => {
  expect(Object.keys(defaultLayout.slots).sort()).toEqual([
    "lap-progress",
    "lap-times",
    "latest-events",
    "map",
    "sector",
    "speed",
    "stats",
    "velocity",
    "weather",
  ]);
});

test("every slot maps to the widget id of the same name", () => {
  for (const [k, v] of Object.entries(defaultLayout.slots)) {
    expect(v).toBe(k);
  }
});

test("columns equal the reference value", () => {
  expect(defaultLayout.grid.columns).toBe("440px 1fr 440px");
});
