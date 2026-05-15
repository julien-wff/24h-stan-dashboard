import type { RaceUpdate } from "@shared/wire/race-update";
import type { Lap, RaceState, SectorAgg } from "./types";

export function reduce(state: RaceState, update: RaceUpdate): RaceState {
  if (update.type === "tick") {
    return {
      ...state,
      t: update.t,
      elapsed: update.elapsed,
      lat: update.lat,
      lon: update.lon,
      heading: update.heading,
      speed: update.speed,
      s: update.s,
      sector: update.sector,
    };
  }

  const newLap: Lap = {
    lap: update.lap,
    timeSec: update.timeSec,
    splits: update.splits,
    startedAt: update.startedAt,
    endedAt: update.endedAt,
  };

  const newLaps: Record<number, Lap> = { ...state.laps, [update.lap]: newLap };

  const allLaps = Object.values(newLaps);

  let bestLap: Lap | null = null;
  for (const lap of allLaps) {
    if (
      bestLap === null ||
      lap.timeSec < bestLap.timeSec ||
      (lap.timeSec === bestLap.timeSec && lap.lap < bestLap.lap)
    ) {
      bestLap = lap;
    }
  }

  const sortedLaps = allLaps.slice().sort((a, b) => a.lap - b.lap);
  const recentLaps = sortedLaps.slice(-8);

  const latestLap = sortedLaps[sortedLaps.length - 1];
  if (!latestLap) throw new Error("unreachable: laps is non-empty after lap update");

  const sectorIndices = [0, 1, 2, 3] as const;
  const newSectors = sectorIndices.map((i): SectorAgg => {
    let best: number | null = null;
    for (const lap of allLaps) {
      const split = lap.splits[i];
      if (best === null || split < best) best = split;
    }
    return { last: latestLap.splits[i], best };
  }) as [SectorAgg, SectorAgg, SectorAgg, SectorAgg];

  return {
    ...state,
    laps: newLaps,
    bestLap,
    recentLaps,
    sectors: newSectors,
  };
}
