import type { Layout } from "../types";

export const defaultLayout: Layout = {
  topbar: "topbar",
  grid: {
    columns: "440px 1fr 440px",
    rows: "auto auto 1fr auto auto",
    areas: [
      "speed    map           sector",
      "velocity map           lap-times",
      "stats    map           lap-times",
      "stats    map           weather",
      "stats    lap-progress  latest-events",
    ],
    gap: 16,
    padding: 16,
  },
  slots: {
    speed: "speed",
    velocity: "velocity",
    stats: "stats",
    map: "map",
    "lap-progress": "lap-progress",
    sector: "sector",
    "lap-times": "lap-times",
    weather: "weather",
    "latest-events": "latest-events",
  },
};
