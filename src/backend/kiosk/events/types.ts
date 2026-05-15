export type LapEvent = {
  lap: number;
  timeSec: number;
  splits: [number, number, number, number];
  startedAt: number;
  endedAt: number;
};

export type RaceEventMap = {
  lap: LapEvent;
};
