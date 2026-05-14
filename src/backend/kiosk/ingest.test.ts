import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { KioskDb } from "./db/client";
import { createKioskDb } from "./db/client";
import { pushSchema } from "./db/push";
import { decodedSamples, rawPackets } from "./db/schema";
import type { DecodedSample } from "./ingest";
import { runIngest } from "./ingest";
import { FixtureSource } from "./telemetry/fixture";
import type { TelemetrySource } from "./telemetry/source";

const FIXTURE_PATH = resolve(import.meta.dir, "./__fixtures__/sample-session.ndjson");

const tmpDir = mkdtempSync(join(tmpdir(), "kiosk-ingest-test-"));
const dbPath = join(tmpDir, "test.db");
let db: KioskDb;

beforeAll(async () => {
  await pushSchema(dbPath);
  db = createKioskDb(dbPath);
});

beforeEach(() => {
  db.delete(decodedSamples).run();
  db.delete(rawPackets).run();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeSource(...lines: string[]): TelemetrySource {
  return {
    lines: async function* () {
      for (const l of lines) yield l;
    },
    stop: async () => {},
  };
}

const validPacketJson = JSON.stringify({
  seq: 0,
  t: 1747219200,
  lat: 48.6951,
  lon: 6.1819,
  speed: 25.0,
  heading: 90.0,
  hdop: 1.2,
  sats: 9,
  bat: 85,
  cad: 90,
  fix: 1,
  fix3d: 1,
  reboot: 0,
  rssi: -68,
  snr: 10.5,
});

test("one valid packet writes one row in each table with correct linkage", async () => {
  await runIngest({ source: makeSource(validPacketJson), db });

  const [raw] = db.select().from(rawPackets).all();
  const [sample] = db.select().from(decodedSamples).all();

  expect(raw).toBeDefined();
  expect(sample).toBeDefined();
  expect(sample?.rawPacketId).toBe(raw?.id ?? -1);
  expect(sample?.lat).toBe(48.6951);
  expect(raw?.payload).toBe(validPacketJson);
});

test("malformed JSON line does not crash and writes nothing", async () => {
  await runIngest({
    source: makeSource("{not json", validPacketJson, validPacketJson, validPacketJson),
    db,
  });

  expect(db.select().from(rawPackets).all()).toHaveLength(3);
  expect(db.select().from(decodedSamples).all()).toHaveLength(3);
});

test("valid JSON with invalid shape does not crash and writes nothing", async () => {
  const missingSpeed = JSON.stringify({ seq: 0, t: 1, lat: 48, lon: 6 });
  await runIngest({
    source: makeSource(missingSpeed, validPacketJson),
    db,
  });

  expect(db.select().from(rawPackets).all()).toHaveLength(1);
  expect(db.select().from(decodedSamples).all()).toHaveLength(1);
});

test("onSample is invoked once per persisted packet", async () => {
  const samples: DecodedSample[] = [];
  const badLine = "{not json";

  await runIngest({
    source: makeSource(validPacketJson, validPacketJson, badLine, validPacketJson),
    db,
    onSample: (s) => samples.push(s),
  });

  expect(samples).toHaveLength(3);
  expect(samples[0]?.seq).toBe(0);
});

test("throwing onSample does not crash the loop and rows remain", async () => {
  let callCount = 0;

  await runIngest({
    source: makeSource(validPacketJson, validPacketJson),
    db,
    onSample: () => {
      callCount++;
      throw new Error("handler exploded");
    },
  });

  expect(callCount).toBe(2);
  expect(db.select().from(rawPackets).all()).toHaveLength(2);
  expect(db.select().from(decodedSamples).all()).toHaveLength(2);
});

test("row counts after a multi-packet fixture match the input", async () => {
  const source = new FixtureSource(FIXTURE_PATH);
  const text = await Bun.file(FIXTURE_PATH).text();
  const lineCount = text.split("\n").filter((l) => l.trim()).length;

  await runIngest({ source, db });

  expect(db.select().from(rawPackets).all()).toHaveLength(lineCount);
  expect(db.select().from(decodedSamples).all()).toHaveLength(lineCount);
});
