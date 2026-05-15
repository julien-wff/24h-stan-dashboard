import { getRaceStartUnixSec } from "@shared/race";
import type { DecodedSample } from "../ingest";
import type { Centerline } from "../track/centerline";
import type { TypedEventBus } from "./bus";
import type { RaceEventMap, TickEvent } from "./types";

export function createTickEmitter({
  bus,
  centerline,
}: {
  bus: TypedEventBus<RaceEventMap>;
  centerline: Centerline;
}): { handleSample(sample: DecodedSample): void } {
  function handleSample(sample: DecodedSample): void {
    if (sample.fix === 0) return;

    const { s, sector } = centerline.project(sample.lat, sample.lon);
    const elapsed = sample.t - getRaceStartUnixSec();

    const event: TickEvent = {
      t: sample.t,
      elapsed,
      lat: sample.lat,
      lon: sample.lon,
      heading: sample.heading,
      speed: sample.speed,
      s,
      sector,
    };
    bus.emit("tick", event);
  }

  return { handleSample };
}
