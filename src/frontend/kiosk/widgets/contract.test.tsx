import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import type { RaceState } from "@frontend/kiosk/state/types";
import { initialRaceState } from "@frontend/kiosk/state/types";
import { cleanup, render } from "@testing-library/react";

beforeAll(() => {
  mock.module("@frontend/kiosk/state/store", () => ({
    useRaceState: (): RaceState => initialRaceState,
  }));
});

afterAll(() => {
  mock.restore();
});

afterEach(() => {
  cleanup();
});

test("every widget outermost element has h-full and w-full classes", async () => {
  const { widgets } = await import("./registry");
  for (const widget of widgets) {
    const { container } = render(
      <div style={{ width: 200, height: 200 }}>
        <widget.Component />
      </div>,
    );
    const outer = container.firstElementChild?.firstElementChild as HTMLElement | null;
    expect(outer, `Widget "${widget.id}" must have an outermost element`).toBeTruthy();
    const classes = outer?.className ?? "";
    expect(
      classes.includes("h-full") && classes.includes("w-full"),
      `Widget "${widget.id}" outermost element must have h-full and w-full classes (got: "${classes}")`,
    ).toBe(true);
    cleanup();
  }
});

test("no widget sets fixed pixel width or height inline on its outermost element", async () => {
  const { widgets } = await import("./registry");
  for (const widget of widgets) {
    const { container } = render(<widget.Component />);
    const outer = container.firstElementChild as HTMLElement | null;
    if (!outer) continue;
    const style = outer.style;
    const hasBadWidth = /\d+px/.test(style.width);
    const hasBadHeight = /\d+px/.test(style.height);
    expect(hasBadWidth, `Widget "${widget.id}" must not set a fixed pixel width inline`).toBe(
      false,
    );
    expect(hasBadHeight, `Widget "${widget.id}" must not set a fixed pixel height inline`).toBe(
      false,
    );
    cleanup();
  }
});
