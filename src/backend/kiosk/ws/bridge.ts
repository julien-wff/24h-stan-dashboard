import type { TypedEventBus } from "../events/bus";
import type { RaceEventMap } from "../events/types";

interface PubSubServer {
  publish(topic: string, data: string): number;
}

export function bridgeBusToServer({
  bus,
  server,
}: {
  bus: TypedEventBus<RaceEventMap>;
  server: PubSubServer;
}): void {
  bus.on("tick", (payload) => {
    server.publish("race", JSON.stringify({ type: "tick", ...payload }));
  });

  bus.on("lap", (payload) => {
    server.publish("race", JSON.stringify({ type: "lap", ...payload }));
  });
}
