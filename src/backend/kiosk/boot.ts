import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createKioskDb } from "./db/client";
import { runIngest } from "./ingest";
import { resolveTelemetrySource } from "./telemetry/source";

const dim = Bun.color("#888888", "ansi");
const accent = Bun.color("#22d3ee", "ansi");
const value = Bun.color("#a3e635", "ansi");
const reset = "\x1b[0m";

const kv = (label: string, v: string) => `  ${dim}${label.padEnd(22)}${reset} ${value}${v}${reset}`;

export async function bootKiosk() {
  const dbPath = resolve(process.env.KIOSK_DB_PATH ?? "./data/kiosk.db");
  const sourceName = process.env.KIOSK_TELEMETRY_SOURCE ?? "simulated";

  console.log(`${accent}──${reset} ${accent}Kiosk${reset} ${dim}${"─".repeat(42)}${reset}`);
  console.log(kv("KIOSK_DB_PATH", dbPath));
  console.log(kv("KIOSK_TELEMETRY_SOURCE", sourceName));

  await mkdir(dirname(dbPath), { recursive: true }).catch((err: Error) => {
    throw new Error(`Failed to create DB directory for ${dbPath}: ${err.message}`);
  });

  const db = createKioskDb(dbPath);
  const source = resolveTelemetrySource(sourceName);

  const ingestPromise = runIngest({ source, db });
  console.log(kv("ingest", "started"));

  return {
    db,
    stopIngest: async () => {
      await source.stop();
      await ingestPromise;
    },
  };
}
