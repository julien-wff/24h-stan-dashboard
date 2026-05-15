export type LapEvent = {
  lap: number;
  timeSec: number;
  splits: [number, number, number, number];
  startedAt: number;
  endedAt: number;
};

export type TickEvent = {
  t: number;
  elapsed: number;
  lat: number;
  lon: number;
  heading: number;
  speed: number;
  s: number;
  sector: 0 | 1 | 2 | 3;
};

export type RaceEventMap = {
  lap: LapEvent;
  tick: TickEvent;
};
