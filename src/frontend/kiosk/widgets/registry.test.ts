import { expect, test } from "bun:test";
import { widgets, widgetsById } from "./registry";

test("widget ids are unique", () => {
  expect(new Set(widgets.map((w) => w.id)).size).toBe(widgets.length);
});

test("widgetsById maps every id to its widget", () => {
  for (const w of widgets) {
    expect(widgetsById[w.id]).toBe(w);
  }
});
