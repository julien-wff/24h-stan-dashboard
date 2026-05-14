import { resolve } from "node:path";
import { FixtureSource } from "./fixture";
import type { ResumeState } from "./resume-state";
import { SimulatorSource } from "./simulator";

export interface TelemetrySource {
  lines(): AsyncIterable<string>;
  stop(): Promise<void>;
}

const BUNDLED_FIXTURE = resolve(import.meta.dir, "../__fixtures__/sample-session.ndjson");

const DEFAULT_TRACK = resolve(import.meta.dir, "../__fixtures__/track.gpx");

export function resolveTelemetrySource(
  value: string,
  options?: { resume?: ResumeState },
): TelemetrySource {
  const resume = options?.resume;

  if (value === "" || value === "simulated") {
    const trackPath = process.env.KIOSK_TRACK_PATH
      ? resolve(process.env.KIOSK_TRACK_PATH)
      : DEFAULT_TRACK;
    const simulatorResume =
      resume?.kind === "simulator" && resume.trackPath === trackPath ? resume : undefined;
    return new SimulatorSource(trackPath, 1000, simulatorResume);
  }

  if (value === "fixture") {
    const fixtureResume =
      resume?.kind === "fixture" && resume.path === BUNDLED_FIXTURE ? resume : undefined;
    return new FixtureSource(BUNDLED_FIXTURE, fixtureResume);
  }

  if (value.startsWith("fixture:")) {
    const path = value.slice("fixture:".length).trim();
    if (!path) {
      throw new Error("fixture path is missing");
    }
    const fixtureResume = resume?.kind === "fixture" && resume.path === path ? resume : undefined;
    return new FixtureSource(path, fixtureResume);
  }

  if (value.startsWith("/dev/") || value.startsWith("tty")) {
    throw new Error(`Serial telemetry source is not yet implemented (got: ${value})`);
  }

  throw new Error(`Unknown KIOSK_TELEMETRY_SOURCE: ${value}`);
}
