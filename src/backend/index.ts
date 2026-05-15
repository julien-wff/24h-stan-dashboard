import { serve } from "bun";
import index from "../frontend/index.html";
import { bootKiosk } from "./kiosk/boot";
import { bridgeBusToServer } from "./kiosk/ws/bridge";
import { createKioskWsHandler } from "./kiosk/ws/handler";

const dim = Bun.color("#888888", "ansi");
const accent = Bun.color("#22d3ee", "ansi");
const value = Bun.color("#a3e635", "ansi");
const reset = "\x1b[0m";

const kv = (label: string, v: string) => `  ${dim}${label.padEnd(22)}${reset} ${value}${v}${reset}`;

console.log(`${accent}── Backend ${"─".repeat(40)}${reset}`);
console.log(kv("APP_MODE", process.env.APP_MODE ?? "(unset → server)"));

let kioskHandle: Awaited<ReturnType<typeof bootKiosk>> | undefined;

if (process.env.APP_MODE === "kiosk") {
  kioskHandle = await bootKiosk();
}

const development = process.env.NODE_ENV !== "production" && {
  hmr: true,
  console: true,
};

const server = kioskHandle
  ? serve({
      routes: {
        "/api/track": () =>
          Response.json({
            points: kioskHandle.centerline.points.map((p) => ({ lat: p.lat, lon: p.lon })),
            totalMeters: kioskHandle.centerline.totalMeters,
          }),
        "/events": (req, server) => {
          if (server.upgrade(req, { data: { connectedAt: Date.now() } })) return undefined;
          return new Response("WebSocket upgrade failed", { status: 400 });
        },
        "/*": index,
      },
      websocket: createKioskWsHandler({
        db: kioskHandle.db,
        centerline: kioskHandle.centerline,
      }),
      development,
    })
  : serve({
      routes: {
        "/*": index,
      },
      development,
    });

if (kioskHandle) {
  bridgeBusToServer({ bus: kioskHandle.bus, server });
}

console.log(kv("HTTP", server.url.toString()));
console.log(`${accent}${"─".repeat(50)}${reset}`);
