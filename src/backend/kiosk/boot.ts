import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createKioskDb } from "./db/client";
import { TypedEventBus } from "./events/bus";
import { createLapDetector } from "./events/lap";
import type { RaceEventMap } from "./events/types";
import { runIngest } from "./ingest";
import { loadResumeState } from "./telemetry/resume-state";
import { resolveTelemetrySource } from "./telemetry/source";
import { loadCenterline } from "./track/centerline";

const dim = Bun.color("#888888", "ansi");
const accent = Bun.color("#22d3ee", "ansi");
const value = Bun.color("#a3e635", "ansi");
const reset = "\x1b[0m";

const kv = (label: string, v: string) => `  ${dim}${label.padEnd(22)}${reset} ${value}${v}${reset}`;

const DEFAULT_GPX_PATH = resolve(import.meta.dir, "./__fixtures__/track.gpx");

export async function bootKiosk() {
  const dbPath = resolve(process.env.KIOSK_DB_PATH ?? "./data/kiosk.db");
  const sourceName = process.env.KIOSK_TELEMETRY_SOURCE ?? "simulated";
  const trackPath = resolve(process.env.KIOSK_TRACK_PATH ?? DEFAULT_GPX_PATH);

  console.log(`${accent}──${reset} ${accent}Kiosk${reset} ${dim}${"─".repeat(42)}${reset}`);
  console.log(kv("KIOSK_DB_PATH", dbPath));
  console.log(kv("KIOSK_TELEMETRY_SOURCE", sourceName));
  console.log(kv("KIOSK_TRACK_PATH", trackPath));

  await mkdir(dirname(dbPath), { recursive: true }).catch((err: Error) => {
    throw new Error(`Failed to create DB directory for ${dbPath}: ${err.message}`);
  });

  const db = createKioskDb(dbPath);

  const resume = await loadResumeState();
  if (resume) {
    console.log(kv("resume state", `kind=${resume.kind}`));
  } else {
    console.log(kv("resume state", "none (starting from zero)"));
  }

  const source = resolveTelemetrySource(sourceName, { resume });

  // Throws with path in message if GPX is missing/invalid — boot fails fast
  const centerline = loadCenterline(trackPath);
  const bus = new TypedEventBus<RaceEventMap>();
  const lapDetector = createLapDetector({ db, centerline, bus });
  console.log(kv("centerline", `${centerline.totalMeters.toFixed(1)} m`));

  const ingestPromise = runIngest({ source, db, onSample: lapDetector.handleSample });
  console.log(kv("ingest", "started"));

  return {
    db,
    bus,
    stopIngest: async () => {
      await source.stop();
      await ingestPromise;
    },
  };
}
