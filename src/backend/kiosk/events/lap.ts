import { max } from "drizzle-orm";
import type { KioskDb } from "../db/client";
import { laps } from "../db/schema";
import type { DecodedSample } from "../ingest";
import type { Centerline } from "../track/centerline";
import type { TypedEventBus } from "./bus";
import type { LapEvent, RaceEventMap } from "./types";

const MIN_LAP_DISTANCE_RATIO = 0.9;

export function createLapDetector({
  db,
  centerline,
  bus,
}: {
  db: KioskDb;
  centerline: Centerline;
  bus: TypedEventBus<RaceEventMap>;
}): { handleSample(sample: DecodedSample): void } {
  const [maxLapRow] = db
    .select({ maxLap: max(laps.lap) })
    .from(laps)
    .all();
  let lapCounter = maxLapRow?.maxLap ?? 0;

  const minLapDistanceM = centerline.totalMeters * MIN_LAP_DISTANCE_RATIO;

  let initialized = false;
  let lastSM = 0;
  let lastT = 0;
  let unwrappedDistanceM = 0;
  let currentBoundary = 0;
  let lastBoundaryUnwrapped = -Infinity;

  let warmupDone = false;
  let currentLapStartedAt = 0;
  let currentSector: 0 | 1 | 2 | 3 = 0;
  const splits: [number, number, number, number] = [0, 0, 0, 0];

  function resetSplits() {
    splits[0] = 0;
    splits[1] = 0;
    splits[2] = 0;
    splits[3] = 0;
  }

  function handleSample(sample: DecodedSample): void {
    if (sample.fix === 0) return;

    const { sM, sector } = centerline.project(sample.lat, sample.lon);

    if (!initialized) {
      initialized = true;
      lastSM = sM;
      lastT = sample.t;
      currentSector = sector;
      unwrappedDistanceM = sM;
      currentBoundary = Math.floor(unwrappedDistanceM / centerline.totalMeters);
      return;
    }

    let delta = sM - lastSM;
    if (delta < -centerline.totalMeters / 2) {
      delta += centerline.totalMeters;
    }

    const dt = sample.t - lastT;
    splits[currentSector] += dt;

    unwrappedDistanceM += delta;
    lastSM = sM;
    lastT = sample.t;
    currentSector = sector;

    const newBoundary = Math.floor(unwrappedDistanceM / centerline.totalMeters);

    if (newBoundary > currentBoundary) {
      currentBoundary = newBoundary;

      const distanceSinceLastBoundary = unwrappedDistanceM - lastBoundaryUnwrapped;
      if (lastBoundaryUnwrapped !== -Infinity && distanceSinceLastBoundary < minLapDistanceM) {
        return;
      }
      lastBoundaryUnwrapped = unwrappedDistanceM;

      if (!warmupDone) {
        warmupDone = true;
        resetSplits();
        currentLapStartedAt = sample.t * 1000;
        return;
      }

      const endedAt = sample.t * 1000;
      const startedAt = currentLapStartedAt;
      const timeSec = (endedAt - startedAt) / 1000;
      const lapSplits: [number, number, number, number] = [...splits] as [
        number,
        number,
        number,
        number,
      ];

      lapCounter++;
      const lapNumber = lapCounter;

      resetSplits();
      currentLapStartedAt = endedAt;

      try {
        db.insert(laps)
          .values({
            lap: lapNumber,
            startedAt,
            endedAt,
            timeSec,
            sector1Sec: lapSplits[0],
            sector2Sec: lapSplits[1],
            sector3Sec: lapSplits[2],
            sector4Sec: lapSplits[3],
          })
          .run();
      } catch (err) {
        console.error(`[lap-detector] Failed to persist lap ${lapNumber}:`, err);
        return;
      }

      const event: LapEvent = {
        lap: lapNumber,
        timeSec,
        splits: lapSplits,
        startedAt,
        endedAt,
      };
      bus.emit("lap", event);
    }
  }

  return { handleSample };
}
