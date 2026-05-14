import { z } from "zod";

export const telemetryPacketSchema = z.object({
  seq: z.number(),
  t: z.number(),
  lat: z.number(),
  lon: z.number(),
  speed: z.number(),
  heading: z.number(),
  hdop: z.number(),
  sats: z.number(),
  bat: z.number().nullable(),
  cad: z.number().nullable(),
  fix: z.number(),
  fix3d: z.number(),
  reboot: z.number(),
  rssi: z.number(),
  snr: z.number(),
});

export type TelemetryPacket = z.infer<typeof telemetryPacketSchema>;

export function validateTelemetryPacket(
  value: unknown,
): { ok: true; packet: TelemetryPacket } | { ok: false; error: string } {
  const result = telemetryPacketSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") ?? "<root>";
    return { ok: false, error: `${path}: ${issue?.message ?? "invalid"}` };
  }
  return { ok: true, packet: result.data };
}
