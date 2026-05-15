import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../db/schema";
import { laps } from "../db/schema";
import type { DecodedSample } from "../ingest";
import { pointAtDistance } from "../telemetry/gpx";
import type { Centerline } from "../track/centerline";
import { loadCenterline } from "../track/centerline";
import { TypedEventBus } from "./bus";
import { createLapDetector } from "./lap";
import type { LapEvent, RaceEventMap } from "./types";

const TRACK_PATH = resolve(import.meta.dir, "../__fixtures__/track.gpx");

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.run(`CREATE TABLE laps (
    lap INTEGER PRIMARY KEY NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    time_sec REAL NOT NULL,
    sector1_sec REAL NOT NULL,
    sector2_sec REAL NOT NULL,
    sector3_sec REAL NOT NULL,
    sector4_sec REAL NOT NULL
  )`);
  return drizzle(sqlite, { schema });
}

function makeBus(): { bus: TypedEventBus<RaceEventMap>; events: LapEvent[] } {
  const bus = new TypedEventBus<RaceEventMap>();
  const events: LapEvent[] = [];
  bus.on("lap", (e) => events.push(e));
  return { bus, events };
}

function makeSample(lat: number, lon: number, t: number, fix = 1): DecodedSample {
  return {
    id: 0,
    rawPacketId: 0,
    seq: 0,
    t,
    lat,
    lon,
    speed: 15,
    heading: 0,
    hdop: 1.2,
    sats: 9,
    bat: 85,
    cad: 90,
    fix,
    fix3d: 1,
    reboot: 0,
    rssi: -68,
    snr: 10.5,
  };
}

const STEPS_PER_LAP = 60;

function driveTrack(centerline: Centerline, numLaps: number, startT: number): DecodedSample[] {
  const stepSize = centerline.totalMeters / STEPS_PER_LAP;
  const samples: DecodedSample[] = [];
  let t = startT;
  // Two extra steps past the final boundary: first lands on sM=0 (wrap), second overshoots
  const totalSteps = numLaps * STEPS_PER_LAP + 2;
  for (let step = 0; step < totalSteps; step++) {
    const distM = step * stepSize;
    const pt = pointAtDistance(centerline, distM % centerline.totalMeters);
    samples.push(makeSample(pt.lat, pt.lon, t));
    t += 1;
  }
  return samples;
}

test("warmup: first boundary crossing emits no event", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const db = makeDb();
  const { bus, events } = makeBus();
  const detector = createLapDetector({ db, centerline, bus });

  const samples = driveTrack(centerline, 1, 1000);
  for (const s of samples) detector.handleSample(s);

  expect(events.length).toBe(0);
});

test("lap 1 is emitted at the second boundary with correct lap number", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const db = makeDb();
  const { bus, events } = makeBus();
  const detector = createLapDetector({ db, centerline, bus });

  const samples = driveTrack(centerline, 2, 1000);
  for (const s of samples) detector.handleSample(s);

  expect(events.length).toBe(1);
  expect(events[0]!.lap).toBe(1);
});

test("splits sum to timeSec within 1e-6", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const db = makeDb();
  const { bus, events } = makeBus();
  const detector = createLapDetector({ db, centerline, bus });

  const samples = driveTrack(centerline, 2, 1000);
  for (const s of samples) detector.handleSample(s);

  const event = events[0]!;
  const splitsSum = event.splits.reduce((a, b) => a + b, 0);
  expect(Math.abs(event.timeSec - splitsSum)).toBeLessThan(1e-6);
});

test("two full laps emit events with lap numbers 1 and 2 in order", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const db = makeDb();
  const { bus, events } = makeBus();
  const detector = createLapDetector({ db, centerline, bus });

  const samples = driveTrack(centerline, 3, 1000);
  for (const s of samples) detector.handleSample(s);

  expect(events.length).toBe(2);
  expect(events[0]!.lap).toBe(1);
  expect(events[1]!.lap).toBe(2);
});

test("fix === 0 samples are ignored: no state change and no lap", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const db = makeDb();
  const { bus, events } = makeBus();
  const detector = createLapDetector({ db, centerline, bus });

  const pt0 = centerline.points[0]!;
  const noFixSample = makeSample(pt0.lat, pt0.lon, 1000, 0);

  detector.handleSample(noFixSample);
  detector.handleSample(noFixSample);

  expect(events.length).toBe(0);
});

test("GPS jitter near the start line does not fire a spurious lap (less than minLapDistance)", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const db = makeDb();
  const { bus, events } = makeBus();
  const detector = createLapDetector({ db, centerline, bus });

  // Warmup: do one full lap
  const warmupSamples = driveTrack(centerline, 1, 1000);
  for (const s of warmupSamples) detector.handleSample(s);
  expect(events.length).toBe(0);

  // Jitter near the start line: only a few steps (much less than 90% of a lap)
  const pt0 = centerline.points[0]!;
  const pt1 = centerline.points[1]!;
  let t = 1000 + warmupSamples.length;
  for (let i = 0; i < 5; i++) {
    detector.handleSample(makeSample(pt0.lat, pt0.lon, t++));
    detector.handleSample(makeSample(pt1.lat, pt1.lon, t++));
  }

  // No lap should have been emitted — car hasn't done a full lap yet
  expect(events.length).toBe(0);
});

test("insert failure suppresses the event but advances the counter", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const db = makeDb();
  const { bus, events } = makeBus();

  const failingInsert = {
    values: () => ({
      run: () => {
        throw new Error("disk full");
      },
    }),
  };

  let insertCallCount = 0;
  const proxiedDb = new Proxy(db, {
    get(target, prop) {
      if (prop === "insert") {
        return (table: unknown) => {
          insertCallCount++;
          // Fail the first insert (lap 1)
          if (insertCallCount === 1) return failingInsert;
          return (target as typeof db).insert(table as Parameters<typeof target.insert>[0]);
        };
      }
      return (target as Record<string | symbol, unknown>)[prop as string];
    },
  }) as typeof db;

  const detector = createLapDetector({ db: proxiedDb, centerline, bus });

  // Do warmup + 2 laps
  const samples = driveTrack(centerline, 3, 1000);
  for (const s of samples) detector.handleSample(s);

  // Lap 1 insert failed → event suppressed. Lap 2 insert succeeded → event emitted with lap=2
  expect(events.length).toBe(1);
  expect(events[0]!.lap).toBe(2);
});

test("construction with pre-populated DB resumes lap counter from MAX(lap) + 1", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const db = makeDb();

  // Pre-populate with lap 7
  db.insert(laps)
    .values({
      lap: 7,
      startedAt: 1000,
      endedAt: 61000,
      timeSec: 60,
      sector1Sec: 15,
      sector2Sec: 15,
      sector3Sec: 15,
      sector4Sec: 15,
    })
    .run();

  const { bus, events } = makeBus();
  const detector = createLapDetector({ db, centerline, bus });

  // Drive warmup + 1 lap → first emitted lap should be 8
  const samples = driveTrack(centerline, 2, 1000);
  for (const s of samples) detector.handleSample(s);

  expect(events.length).toBe(1);
  expect(events[0]!.lap).toBe(8);
});

test("emitted lap event is persisted before emit (DB row visible inside handler)", () => {
  const centerline = loadCenterline(TRACK_PATH);
  const db = makeDb();
  const bus = new TypedEventBus<RaceEventMap>();

  let rowFound = false;
  bus.on("lap", (e) => {
    const rows = db.select().from(laps).all();
    rowFound = rows.some((r) => r.lap === e.lap);
  });

  const detector = createLapDetector({ db, centerline, bus });
  const samples = driveTrack(centerline, 2, 1000);
  for (const s of samples) detector.handleSample(s);

  expect(rowFound).toBe(true);
});
