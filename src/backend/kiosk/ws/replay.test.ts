import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KioskDb } from "../db/client";
import { createKioskDb } from "../db/client";
import { pushSchema } from "../db/push";
import { decodedSamples, laps, rawPackets } from "../db/schema";
import { buildReplay } from "./replay";

const tmpDir = mkdtempSync(join(tmpdir(), "ws-replay-test-"));
const dbPath = join(tmpDir, "test.db");
let db: KioskDb;

const mockCenterline = {
  points: [],
  totalMeters: 1000,
  project: (_lat: number, _lon: number) => ({ sM: 250, s: 0.25, sector: 1 as const }),
};

beforeAll(async () => {
  await pushSchema(dbPath);
  db = createKioskDb(dbPath);
});

afterEach(() => {
  db.delete(decodedSamples).run();
  db.delete(rawPackets).run();
  db.delete(laps).run();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function insertRawPacket(): number {
  const [row] = db
    .insert(rawPackets)
    .values({ seq: 1, receivedAt: Date.now(), payload: "{}" })
    .returning({ id: rawPackets.id })
    .all();
  if (!row) throw new Error("insertRawPacket: expected returning row");
  return row.id;
}

function insertSample(overrides: { fix?: number; t?: number } = {}) {
  const rawId = insertRawPacket();
  const [row] = db
    .insert(decodedSamples)
    .values({
      rawPacketId: rawId,
      seq: 1,
      t: overrides.t ?? 10000,
      lat: 48.5,
      lon: 6.5,
      speed: 30,
      heading: 90,
      hdop: 1,
      sats: 8,
      bat: null,
      cad: null,
      fix: overrides.fix ?? 1,
      fix3d: 1,
      reboot: 0,
      rssi: -70,
      snr: 10,
    })
    .returning()
    .all();
  if (!row) throw new Error("insertSample: expected returning row");
  return row;
}

function insertLap(lap: number) {
  db.insert(laps)
    .values({
      lap,
      startedAt: 1000,
      endedAt: 91000,
      timeSec: 90,
      sector1Sec: 22,
      sector2Sec: 23,
      sector3Sec: 22,
      sector4Sec: 23,
    })
    .run();
}

test("empty DB produces empty replay", () => {
  const result = buildReplay({ db, centerline: mockCenterline });
  expect(result).toHaveLength(0);
});

test("laps only returns ordered lap updates", () => {
  insertLap(3);
  insertLap(1);
  insertLap(2);

  const result = buildReplay({ db, centerline: mockCenterline });
  expect(result).toHaveLength(3);
  expect(result[0]?.type).toBe("lap");
  expect((result[0] as { lap: number }).lap).toBe(1);
  expect((result[1] as { lap: number }).lap).toBe(2);
  expect((result[2] as { lap: number }).lap).toBe(3);
});

test("sample with fix !== 0 is appended as a tick after laps", () => {
  insertLap(1);
  insertSample({ fix: 1, t: 9999 });

  const result = buildReplay({ db, centerline: mockCenterline });
  expect(result).toHaveLength(2);
  expect(result[0]?.type).toBe("lap");
  const tick = result[1];
  if (!tick) throw new Error("expected a tick after lap");
  expect(tick.type).toBe("tick");
  if (tick.type === "tick") {
    expect(tick.t).toBe(9999);
    expect(tick.s).toBe(0.25);
    expect(tick.sector).toBe(1);
  }
});

test("sample with fix === 0 is not included in replay", () => {
  insertSample({ fix: 0 });
  const result = buildReplay({ db, centerline: mockCenterline });
  expect(result).toHaveLength(0);
});

test("latest sample by id is used when multiple samples exist", () => {
  insertSample({ fix: 1, t: 1000 });
  insertSample({ fix: 1, t: 9999 });

  const result = buildReplay({ db, centerline: mockCenterline });
  expect(result).toHaveLength(1);
  const tick = result[0];
  if (!tick) throw new Error("expected a tick");
  expect(tick.type).toBe("tick");
  if (tick.type === "tick") {
    expect(tick.t).toBe(9999);
  }
});
