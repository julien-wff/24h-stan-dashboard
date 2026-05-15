import { afterEach, beforeEach, expect, test } from "bun:test";
import { getSnapshot, resetState } from "./state/store";

// Fake WebSocket implementation
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {}

  triggerOpen() {
    this.onopen?.(new Event("open"));
  }

  triggerMessage(data: string) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  triggerClose() {
    this.onclose?.(new CloseEvent("close"));
  }
}

const mutableGlobal = globalThis as unknown as Record<string, unknown>;

// Override globals
const originalWebSocket = mutableGlobal.WebSocket;
const originalWindow = mutableGlobal.window;
const originalLocation = mutableGlobal.location;

const fakeLocation = {
  protocol: "http:",
  host: "localhost:3000",
  href: "http://localhost:3000",
};

beforeEach(() => {
  FakeWebSocket.instances = [];
  mutableGlobal.WebSocket = FakeWebSocket;
  mutableGlobal.window = { location: fakeLocation };
  mutableGlobal.location = fakeLocation;
  resetState();
});

afterEach(() => {
  mutableGlobal.WebSocket = originalWebSocket;
  mutableGlobal.window = originalWindow;
  mutableGlobal.location = originalLocation;
  resetState();
});

test("valid update is dispatched", async () => {
  const { connect } = await import("./ws-client");
  const dispose = connect();

  const ws = FakeWebSocket.instances[0];
  if (!ws) throw new Error("expected websocket instance");
  ws.triggerOpen();
  ws.triggerMessage(
    JSON.stringify({
      type: "tick",
      t: 1,
      elapsed: 0,
      lat: 48,
      lon: 6,
      heading: 90,
      speed: 15,
      s: 0.5,
      sector: 1,
    }),
  );

  expect(getSnapshot().t).toBe(1);
  dispose();
});

test("invalid update is dropped and does not dispatch", async () => {
  const consoleErrors: unknown[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => consoleErrors.push(args);

  const { connect } = await import("./ws-client");
  const dispose = connect();

  const ws = FakeWebSocket.instances[0];
  if (!ws) throw new Error("expected websocket instance");
  ws.triggerOpen();
  ws.triggerMessage(JSON.stringify({ type: "unknown" }));

  expect(getSnapshot().t).toBeNull();
  expect(consoleErrors.length).toBeGreaterThan(0);

  console.error = originalConsoleError;
  dispose();
});

test("malformed JSON is dropped", async () => {
  const consoleErrors: unknown[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => consoleErrors.push(args);

  const { connect } = await import("./ws-client");
  const dispose = connect();

  const ws = FakeWebSocket.instances[0];
  if (!ws) throw new Error("expected websocket instance");
  ws.triggerOpen();
  ws.triggerMessage("not json");

  expect(getSnapshot().t).toBeNull();
  expect(consoleErrors.length).toBeGreaterThan(0);

  console.error = originalConsoleError;
  dispose();
});

test("backoff schedule: 1s, 2s, 4s, 8s on consecutive closes", async () => {
  const delays: number[] = [];
  const originalSetTimeout = mutableGlobal.setTimeout;
  mutableGlobal.setTimeout = (fn: TimerHandler, delay?: number, ...args: unknown[]) => {
    delays.push(delay ?? 0);
    return (originalSetTimeout as typeof setTimeout)(fn, 9999999, ...args);
  };

  const { connect } = await import("./ws-client");
  const dispose = connect();

  const ws0 = FakeWebSocket.instances[0];
  if (!ws0) throw new Error("expected websocket instance");
  ws0.triggerClose();
  ws0.triggerClose();
  ws0.triggerClose();
  ws0.triggerClose();

  mutableGlobal.setTimeout = originalSetTimeout;
  dispose();

  expect(delays[0]).toBe(1000);
  expect(delays[1]).toBe(2000);
  expect(delays[2]).toBe(4000);
  expect(delays[3]).toBe(8000);
});

test("backoff caps at 30s after many closes", async () => {
  const delays: number[] = [];
  const originalSetTimeout = mutableGlobal.setTimeout;
  mutableGlobal.setTimeout = (fn: TimerHandler, delay?: number, ...args: unknown[]) => {
    delays.push(delay ?? 0);
    return (originalSetTimeout as typeof setTimeout)(fn, 9999999, ...args);
  };

  const { connect } = await import("./ws-client");
  const dispose = connect();

  const ws0 = FakeWebSocket.instances[0];
  if (!ws0) throw new Error("expected websocket instance");
  for (let i = 0; i < 10; i++) {
    ws0.triggerClose();
  }

  mutableGlobal.setTimeout = originalSetTimeout;
  dispose();

  expect(delays[delays.length - 1]).toBeLessThanOrEqual(30000);
});

test("successful open resets backoff", async () => {
  const delays: number[] = [];
  const originalSetTimeout = mutableGlobal.setTimeout;
  mutableGlobal.setTimeout = (fn: TimerHandler, delay?: number, ...args: unknown[]) => {
    delays.push(delay ?? 0);
    return (originalSetTimeout as typeof setTimeout)(fn, 9999999, ...args);
  };

  const { connect } = await import("./ws-client");
  const dispose = connect();

  const ws0 = FakeWebSocket.instances[0];
  if (!ws0) throw new Error("expected websocket instance");
  ws0.triggerClose();
  ws0.triggerClose();
  ws0.triggerOpen();
  ws0.triggerClose();

  mutableGlobal.setTimeout = originalSetTimeout;
  dispose();

  expect(delays[0]).toBe(1000);
  expect(delays[1]).toBe(2000);
  expect(delays[2]).toBe(1000);
});

test("disposer cancels pending reconnect", async () => {
  let clearCalled = 0;
  const originalClearTimeout = mutableGlobal.clearTimeout;
  mutableGlobal.clearTimeout = (id: unknown) => {
    clearCalled++;
    (originalClearTimeout as (id: unknown) => void)(id);
  };

  const originalSetTimeout = mutableGlobal.setTimeout;
  mutableGlobal.setTimeout = (fn: TimerHandler, delay?: number, ...args: unknown[]) => {
    void delay;
    return (originalSetTimeout as typeof setTimeout)(fn, 9999999, ...args);
  };

  const { connect } = await import("./ws-client");
  const dispose = connect();

  FakeWebSocket.instances[0]?.triggerClose();
  dispose();

  mutableGlobal.clearTimeout = originalClearTimeout;
  mutableGlobal.setTimeout = originalSetTimeout;

  expect(clearCalled).toBeGreaterThanOrEqual(1);
});
