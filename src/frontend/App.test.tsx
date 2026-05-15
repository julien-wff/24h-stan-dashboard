import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(() => {
  mock.restore();
  cleanup();
});

mock.module("./kiosk/KioskPage", () => ({
  KioskPage: () => <div data-testid="kiosk-page">KioskPage</div>,
}));
mock.module("./kiosk/DebugPage", () => ({
  DebugPage: () => <div data-testid="debug-page">DebugPage</div>,
}));

test("/kiosk renders KioskPage", async () => {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: "/kiosk" },
    writable: true,
    configurable: true,
  });
  const { App } = await import("./App");
  render(<App />);
  expect(screen.getByTestId("kiosk-page")).toBeTruthy();
  expect(screen.queryByTestId("debug-page")).toBeNull();
});

test("/kiosk/debug renders DebugPage", async () => {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: "/kiosk/debug" },
    writable: true,
    configurable: true,
  });
  const { App } = await import("./App");
  render(<App />);
  expect(screen.getByTestId("debug-page")).toBeTruthy();
  expect(screen.queryByTestId("kiosk-page")).toBeNull();
});

test("unknown path renders fallback", async () => {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: "/unknown" },
    writable: true,
    configurable: true,
  });
  const { App } = await import("./App");
  render(<App />);
  expect(screen.getByText("Hello, World!")).toBeTruthy();
});
