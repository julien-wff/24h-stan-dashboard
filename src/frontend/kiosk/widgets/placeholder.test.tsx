import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { placeholder } from "./placeholder";

afterEach(() => {
  cleanup();
});

test("placeholder renders the given title in the header", () => {
  const { Component } = placeholder("weather", "WEATHER · NANCY");
  render(<Component />);
  expect(screen.getByText("WEATHER · NANCY")).toBeTruthy();
});

test("placeholder body is empty", () => {
  const { Component } = placeholder("test-widget", "TEST TITLE");
  const { container } = render(<Component />);
  const panel = container.firstElementChild;
  const body = panel?.children[1];
  expect(body?.textContent).toBe("");
});

test("placeholder source file does not import useRaceState", () => {
  const src = readFileSync(new URL("./placeholder.tsx", import.meta.url).pathname, "utf-8");
  expect(src).not.toContain("useRaceState");
});
