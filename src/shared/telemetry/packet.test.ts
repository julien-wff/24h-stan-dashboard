import { expect, test } from "bun:test";
import { validateTelemetryPacket } from "./packet";

const validPacket = {
  seq: 0,
  t: 1747219200,
  lat: 48.6951,
  lon: 6.1819,
  speed: 25.0,
  heading: 90.0,
  hdop: 1.2,
  sats: 9,
  bat: 85,
  cad: 90,
  fix: 1,
  fix3d: 1,
  reboot: 0,
  rssi: -68,
  snr: 10.5,
};

test("accepts a valid packet", () => {
  const result = validateTelemetryPacket(validPacket);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.packet.seq).toBe(0);
    expect(result.packet.lat).toBe(48.6951);
    expect(result.packet.bat).toBe(85);
  }
});

test("rejects a missing required field with the field name in the error", () => {
  const { speed: _speed, ...noSpeed } = validPacket;
  const result = validateTelemetryPacket(noSpeed);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain("speed");
  }
});

test("rejects a wrong-type field with the field name in the error", () => {
  const result = validateTelemetryPacket({ ...validPacket, seq: "not-a-number" });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain("seq");
  }
});

test("nullable fields accept null", () => {
  const result = validateTelemetryPacket({ ...validPacket, bat: null, cad: null });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.packet.bat).toBeNull();
    expect(result.packet.cad).toBeNull();
  }
});

test("rejects non-object values", () => {
  expect(validateTelemetryPacket(null).ok).toBe(false);
  expect(validateTelemetryPacket(42).ok).toBe(false);
  expect(validateTelemetryPacket("string").ok).toBe(false);
});

test("rejects nullable field with wrong type", () => {
  const result = validateTelemetryPacket({ ...validPacket, bat: "full" });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain("bat");
  }
});
