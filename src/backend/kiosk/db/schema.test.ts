import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pushSchema } from "./push";

const tmpDir = mkdtempSync(join(tmpdir(), "kiosk-schema-test-"));
const dbPath = join(tmpDir, "test.db");

beforeAll(async () => {
  await pushSchema(dbPath);
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test("pushes raw_packets and decoded_samples tables to a fresh DB", () => {
  const db = new Database(dbPath);

  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>;
  const tableNames = tables.map((t) => t.name);

  expect(tableNames).toContain("raw_packets");
  expect(tableNames).toContain("decoded_samples");

  db.close();
});

test("creates indexes on decoded_samples(seq) and decoded_samples(t)", () => {
  const db = new Database(dbPath);

  const indexes = db
    .query(
      "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_auto%' ORDER BY name",
    )
    .all() as Array<{ name: string; tbl_name: string }>;

  const decodedIndexes = indexes.filter((i) => i.tbl_name === "decoded_samples");
  expect(decodedIndexes.length).toBeGreaterThanOrEqual(2);

  const indexNames = decodedIndexes.map((i) => i.name);
  expect(indexNames.some((n) => n.includes("seq"))).toBe(true);
  expect(indexNames.some((n) => n.includes("_t"))).toBe(true);

  db.close();
});

test("pushes laps table to DB with lap as primary key", () => {
  const db = new Database(dbPath);

  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>;
  expect(tables.map((t) => t.name)).toContain("laps");

  const cols = db.query("PRAGMA table_info(laps)").all() as Array<{
    name: string;
    pk: number;
    notnull: number;
  }>;
  const colNames = cols.map((c) => c.name);
  expect(colNames).toContain("lap");
  expect(colNames).toContain("started_at");
  expect(colNames).toContain("ended_at");
  expect(colNames).toContain("time_sec");
  expect(colNames).toContain("sector1_sec");
  expect(colNames).toContain("sector2_sec");
  expect(colNames).toContain("sector3_sec");
  expect(colNames).toContain("sector4_sec");

  const lapCol = cols.find((c) => c.name === "lap");
  expect(lapCol?.pk).toBe(1);

  const isBestCols = cols.filter((c) => c.name.startsWith("is_best"));
  expect(isBestCols.length).toBe(0);

  db.close();
});

test("re-running pushSchema against an unchanged DB is a no-op (existing data preserved)", async () => {
  const db = new Database(dbPath);
  db.run("INSERT INTO raw_packets (seq, received_at, payload) VALUES (99, 1000, '{}')");
  const beforeCount = (db.query("SELECT COUNT(*) as n FROM raw_packets").get() as { n: number }).n;
  db.close();

  await pushSchema(dbPath);

  const db2 = new Database(dbPath);
  const afterCount = (db2.query("SELECT COUNT(*) as n FROM raw_packets").get() as { n: number }).n;
  db2.close();

  expect(afterCount).toBe(beforeCount);
});
