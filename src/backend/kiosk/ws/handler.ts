import type { WebSocketHandler } from "bun";
import type { KioskDb } from "../db/client";
import type { Centerline } from "../track/centerline";
import { buildReplay } from "./replay";

type WsData = { connectedAt: number };

export function createKioskWsHandler({
  db,
  centerline,
}: {
  db: KioskDb;
  centerline: Centerline;
}): WebSocketHandler<WsData> {
  return {
    open(ws) {
      const replay = buildReplay({ db, centerline });
      for (const update of replay) {
        ws.send(JSON.stringify(update));
      }
      ws.subscribe("race");
    },
    message(_ws, _msg) {},
    close(_ws) {},
  };
}
