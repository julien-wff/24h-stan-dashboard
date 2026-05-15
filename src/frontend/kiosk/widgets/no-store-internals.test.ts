import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WIDGETS_DIR = new URL(".", import.meta.url).pathname;

const FORBIDDEN_IMPORTS = ["getSnapshot", "subscribe", "dispatch", "setConnection", "resetState"];

const FORBIDDEN_IO = ["new WebSocket(", "WebSocket(", "fetch("];

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      result.push(full);
    }
  }
  return result;
}

test("no widget imports store internals", () => {
  const files = collectFiles(WIDGETS_DIR);
  const violations: string[] = [];
  for (const file of files) {
    if (file.includes(".test.")) continue;
    const src = readFileSync(file, "utf-8");
    // Only check files that import from the store
    if (!src.includes("kiosk/state/store")) continue;
    for (const sym of FORBIDDEN_IMPORTS) {
      // Check if the symbol is imported (not just used in a string/comment)
      if (new RegExp(`\\b${sym}\\b`).test(src)) {
        violations.push(`${file}: imports/uses "${sym}"`);
      }
    }
  }
  expect(violations, violations.join("\n")).toEqual([]);
});

test("no widget performs I/O (WebSocket or fetch)", () => {
  const files = collectFiles(WIDGETS_DIR);
  const violations: string[] = [];
  for (const file of files) {
    if (file.includes(".test.")) continue;
    const src = readFileSync(file, "utf-8");
    for (const pattern of FORBIDDEN_IO) {
      if (src.includes(pattern)) {
        violations.push(`${file}: contains "${pattern}"`);
      }
    }
  }
  expect(violations, violations.join("\n")).toEqual([]);
});
