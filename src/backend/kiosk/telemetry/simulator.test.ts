import { expect, test } from "bun:test";
import { validateTelemetryPacket } from "../../../shared/telemetry/packet";
import { SimulatorSource } from "./simulator";

test("simulator output is contract-valid for the first 50 lines", async () => {
  const source = new SimulatorSource(0);
  const lines: string[] = [];

  for await (const line of source.lines()) {
    lines.push(line);
    if (lines.length >= 50) {
      await source.stop();
      break;
    }
  }

  expect(lines.length).toBe(50);

  for (const line of lines) {
    const parsed = JSON.parse(line);
    const result = validateTelemetryPacket(parsed);
    expect(result.ok).toBe(true);
  }
});

test("seq is monotonic with wrap allowed at 65535", async () => {
  const source = new SimulatorSource(0);
  const seqs: number[] = [];

  for await (const line of source.lines()) {
    const parsed = JSON.parse(line) as { seq: number };
    seqs.push(parsed.seq);
    if (seqs.length >= 100) {
      await source.stop();
      break;
    }
  }

  expect(seqs.length).toBe(100);

  for (let i = 1; i < seqs.length; i++) {
    const prev = seqs[i - 1] as number;
    const curr = seqs[i] as number;
    const isMonotonic = curr === prev + 1 || (prev === 65535 && curr === 0);
    expect(isMonotonic).toBe(true);
  }
});

test("stop() halts emission", async () => {
  const source = new SimulatorSource(0);
  const lines: string[] = [];

  for await (const line of source.lines()) {
    lines.push(line);
    if (lines.length >= 5) {
      await source.stop();
    }
  }

  expect(lines.length).toBe(5);
});
