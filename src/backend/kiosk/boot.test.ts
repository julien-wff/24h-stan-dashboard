import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootKiosk } from "./boot";
import { pushSchema } from "./db/push";

const tmpDir = mkdtempSync(join(tmpdir(), "boot-test-"));
const dbPath = join(tmpDir, "test-boot.db");

beforeAll(async () => {
  await pushSchema(dbPath);
  process.env.KIOSK_DB_PATH = dbPath;
  process.env.KIOSK_TELEMETRY_SOURCE = "fixture";
});

afterAll(() => {
  delete process.env.KIOSK_DB_PATH;
  delete process.env.KIOSK_TELEMETRY_SOURCE;
  rmSync(tmpDir, { recursive: true, force: true });
});

test("kiosk boots end-to-end with fixture source and starts ingest", async () => {
  const { db, stopIngest } = await bootKiosk();
  // Let the ingest loop run briefly, then stop
  await new Promise((r) => setTimeout(r, 50));
  await stopIngest();
  expect(db).toBeDefined();
});

test("boot tolerates a missing data/simulator-state.json", async () => {
  // Ensure the file doesn't exist at the default path — we just verify bootKiosk doesn't throw
  await expect(bootKiosk().then(({ stopIngest }) => stopIngest())).resolves.toBeUndefined();
});

test("boot tolerates a malformed data/simulator-state.json", async () => {
  await Bun.write("data/simulator-state.json", "{invalid json}");
  await expect(bootKiosk().then(({ stopIngest }) => stopIngest())).resolves.toBeUndefined();
  // cleanup
  await Bun.write("data/simulator-state.json", "{}");
});

test("boot does not spawn drizzle-kit (no schema push)", async () => {
  // Verify boot.ts source does not call pushSchema or drizzle-kit
  const bootSource = await Bun.file(new URL("./boot.ts", import.meta.url).pathname).text();
  expect(bootSource).not.toContain("pushSchema");
  expect(bootSource).not.toContain("drizzle-kit");
});
