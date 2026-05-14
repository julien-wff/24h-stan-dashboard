import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

export const simulatorStateSchema = z.object({
  kind: z.literal("simulator"),
  trackPath: z.string(),
  distanceM: z.number(),
  elapsedSec: z.number(),
  seq: z.number(),
});

export const fixtureStateSchema = z.object({
  kind: z.literal("fixture"),
  path: z.string(),
  lineIndex: z.number(),
  seq: z.number(),
});

export const resumeStateSchema = z.discriminatedUnion("kind", [
  simulatorStateSchema,
  fixtureStateSchema,
]);

export type SimulatorState = z.infer<typeof simulatorStateSchema>;
export type FixtureState = z.infer<typeof fixtureStateSchema>;
export type ResumeState = z.infer<typeof resumeStateSchema>;

const DEFAULT_PATH = "data/simulator-state.json";

export async function loadResumeState(path = DEFAULT_PATH): Promise<ResumeState | undefined> {
  try {
    const data = await Bun.file(path).json();
    const parsed = resumeStateSchema.safeParse(data);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export async function saveResumeState(state: ResumeState, path = DEFAULT_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(state));
}
