import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export function createKioskDb(path: string) {
  const sqlite = new Database(path);
  return drizzle(sqlite, { schema });
}

export type KioskDb = ReturnType<typeof createKioskDb>;
