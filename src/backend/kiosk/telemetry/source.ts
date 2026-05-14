import { SimulatorSource } from "./simulator";

export interface TelemetrySource {
  lines(): AsyncIterable<string>;
  stop(): Promise<void>;
}

export function resolveTelemetrySource(value: string): TelemetrySource {
  if (value === "simulated") {
    return new SimulatorSource();
  }
  if (value.startsWith("/dev/") || value.startsWith("tty")) {
    throw new Error(`Serial telemetry source is not yet implemented (got: ${value})`);
  }
  throw new Error(`Unknown KIOSK_TELEMETRY_SOURCE: ${value}`);
}
