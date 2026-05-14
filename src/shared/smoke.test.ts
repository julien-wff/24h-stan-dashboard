import { expect, test } from "bun:test";
import { SHARED_OK } from "@shared/index";

test("@shared alias resolves", () => {
  expect(SHARED_OK).toBe(true);
});

test("bun:test is wired", () => {
  expect(1).toBe(1);
});
