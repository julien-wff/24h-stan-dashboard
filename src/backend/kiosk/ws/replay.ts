import { getRaceStartUnixSec } from "@shared/race";
import type { RaceUpdate } from "@shared/wire/race-update";
import { asc, desc, ne } from "drizzle-orm";
import type { KioskDb } from "../db/client";
import { decodedSamples, laps } from "../db/schema";
import type { Centerline } from "../track/centerline";

export function buildReplay({
  db,
  centerline,
}: {
  db: KioskDb;
  centerline: Centerline;
}): RaceUpdate[] {
  const lapRows = db.select().from(laps).orderBy(asc(laps.lap)).all();

  const lapUpdates: RaceUpdate[] = lapRows.map((row) => ({
    type: "lap",
    lap: row.lap,
    timeSec: row.timeSec,
    splits: [row.sector1Sec, row.sector2Sec, row.sector3Sec, row.sector4Sec],
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  }));

  const [latestSample] = db
    .select()
    .from(decodedSamples)
    .where(ne(decodedSamples.fix, 0))
    .orderBy(desc(decodedSamples.id))
    .limit(1)
    .all();

  if (!latestSample) {
    return lapUpdates;
  }

  const { s, sector } = centerline.project(latestSample.lat, latestSample.lon);
  const raceStart = getRaceStartUnixSec();

  const tickUpdate: RaceUpdate = {
    type: "tick",
    t: latestSample.t,
    elapsed: latestSample.t - raceStart,
    lat: latestSample.lat,
    lon: latestSample.lon,
    heading: latestSample.heading,
    speed: latestSample.speed,
    s,
    sector,
  };

  return [...lapUpdates, tickUpdate];
}
