import { serve } from "bun";
import index from "../frontend/index.html";
import { bootKiosk } from "./kiosk/boot";

const dim = Bun.color("#888888", "ansi");
const accent = Bun.color("#22d3ee", "ansi");
const value = Bun.color("#a3e635", "ansi");
const reset = "\x1b[0m";

const kv = (label: string, v: string) => `  ${dim}${label.padEnd(22)}${reset} ${value}${v}${reset}`;

console.log(`${accent}── Backend ${"─".repeat(40)}${reset}`);
console.log(kv("APP_MODE", process.env.APP_MODE ?? "(unset → server)"));

if (process.env.APP_MODE === "kiosk") {
  await bootKiosk();
}

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(_req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(_req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async (req) => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(kv("HTTP", server.url.toString()));
console.log(`${accent}${"─".repeat(50)}${reset}`);
