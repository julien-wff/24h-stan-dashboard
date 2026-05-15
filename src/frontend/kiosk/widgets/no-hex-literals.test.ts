import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WIDGETS_DIR = new URL(".", import.meta.url).pathname;

const FORBIDDEN = [
  "#fbe216",
  "#0a0a0a",
  "#13130f",
  "#00d97e",
  "#ffb000",
  "#ff3b3b",
  "#bf5af2",
  "#ffffff",
  "rgba(255,255,255,0.7)",
  "rgba(255,255,255,.7)",
  "rgba(255,255,255,0.45)",
  "rgba(255,255,255,.45)",
  "rgba(255,255,255,.09)",
];

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(full));
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      result.push(full);
    }
  }
  return result;
}

test("no palette hex literals in widget source files", () => {
  const files = collectFiles(WIDGETS_DIR);
  const violations: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf-8");
    for (const literal of FORBIDDEN) {
      if (src.includes(literal)) {
        violations.push(`${file}: contains "${literal}"`);
      }
    }
  }
  expect(violations, violations.join("\n")).toEqual([]);
});
