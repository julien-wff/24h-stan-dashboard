import { z } from "zod";

export const raceUpdateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tick"),
    t: z.number(),
    elapsed: z.number(),
    lat: z.number(),
    lon: z.number(),
    heading: z.number(),
    speed: z.number(),
    s: z.number(),
    sector: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  }),
  z.object({
    type: z.literal("lap"),
    lap: z.number(),
    timeSec: z.number(),
    splits: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    startedAt: z.number(),
    endedAt: z.number(),
  }),
]);

export type RaceUpdate = z.infer<typeof raceUpdateSchema>;
