import { validateTelemetryPacket } from "../../shared/telemetry/packet";
import type { KioskDb } from "./db/client";
import { decodedSamples, rawPackets } from "./db/schema";
import type { TelemetrySource } from "./telemetry/source";

export type DecodedSample = typeof decodedSamples.$inferSelect;

export async function runIngest({
  source,
  db,
  onSample,
}: {
  source: TelemetrySource;
  db: KioskDb;
  onSample?: (sample: DecodedSample) => void;
}): Promise<void> {
  for await (const line of source.lines()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.error(
        `[ingest] JSON parse error: ${line.slice(0, 120)}${line.length > 120 ? "…" : ""}`,
      );
      continue;
    }

    const validation = validateTelemetryPacket(parsed);
    if (!validation.ok) {
      console.error(`[ingest] Validation error: ${validation.error}`);
      continue;
    }

    const { packet } = validation;

    const sample = db.transaction((tx): DecodedSample => {
      const [raw] = tx
        .insert(rawPackets)
        .values({
          seq: packet.seq,
          receivedAt: Date.now(),
          payload: line,
        })
        .returning({ id: rawPackets.id })
        .all();
      if (!raw) throw new Error("ingest: raw_packets insert returned no row");

      const [decoded] = tx
        .insert(decodedSamples)
        .values({
          rawPacketId: raw.id,
          seq: packet.seq,
          t: packet.t,
          lat: packet.lat,
          lon: packet.lon,
          speed: packet.speed,
          heading: packet.heading,
          hdop: packet.hdop,
          sats: packet.sats,
          bat: packet.bat,
          cad: packet.cad,
          fix: packet.fix,
          fix3d: packet.fix3d,
          reboot: packet.reboot,
          rssi: packet.rssi,
          snr: packet.snr,
        })
        .returning()
        .all();
      if (!decoded) throw new Error("ingest: decoded_samples insert returned no row");

      return decoded;
    });

    if (onSample) {
      try {
        onSample(sample);
      } catch (err) {
        console.error("[ingest] onSample handler error:", err);
      }
    }
  }
}
