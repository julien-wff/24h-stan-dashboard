import { LapProgressWidget } from "./lap-progress/index";
import { LapTimesWidget } from "./lap-times/index";
import { MapWidget } from "./map/index";
import { placeholder } from "./placeholder";
import { SectorWidget } from "./sector/index";
import { SpeedWidget } from "./speed/index";
import { StatsWidget } from "./stats/index";
import { TopbarWidget } from "./topbar/index";
import type { Widget } from "./types";

const VelocityPlaceholder = placeholder("velocity", "VELOCITY · 240s");
const WeatherPlaceholder = placeholder("weather", "WEATHER · NANCY");
const LatestEventsPlaceholder = placeholder("latest-events", "LATEST EVENTS");

export const widgets: readonly Widget[] = [
  TopbarWidget,
  SpeedWidget,
  StatsWidget,
  SectorWidget,
  LapProgressWidget,
  LapTimesWidget,
  VelocityPlaceholder,
  MapWidget,
  WeatherPlaceholder,
  LatestEventsPlaceholder,
];

export const widgetsById: Readonly<Record<string, Widget>> = Object.fromEntries(
  widgets.map((w) => [w.id, w]),
);
