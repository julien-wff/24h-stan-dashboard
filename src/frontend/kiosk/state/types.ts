export type Lap = {
  lap: number;
  timeSec: number;
  splits: [number, number, number, number];
  startedAt: number;
  endedAt: number;
};

export type SectorAgg = { last: number | null; best: number | null };

export type RaceState = {
  t: number | null;
  elapsed: number | null;
  lat: number | null;
  lon: number | null;
  heading: number | null;
  speed: number | null;
  s: number | null;
  sector: 0 | 1 | 2 | 3 | null;

  laps: Record<number, Lap>;
  bestLap: Lap | null;
  recentLaps: Lap[];
  sectors: [SectorAgg, SectorAgg, SectorAgg, SectorAgg];

  connection: "connecting" | "open" | "closed";
};

export const initialRaceState: RaceState = {
  t: null,
  elapsed: null,
  lat: null,
  lon: null,
  heading: null,
  speed: null,
  s: null,
  sector: null,

  laps: {},
  bestLap: null,
  recentLaps: [],
  sectors: [
    { last: null, best: null },
    { last: null, best: null },
    { last: null, best: null },
    { last: null, best: null },
  ],

  connection: "connecting",
};
