import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "../../../../");

// drizzle-kit push is non-interactive for fresh DBs and additive changes.
// For destructive schema changes on an existing DB, it will prompt; the
// recovery path is to delete data/kiosk.db and let the next boot recreate it.
export async function pushSchema(dbPath: string): Promise<void> {
  const proc = Bun.spawn(["bun", "x", "drizzle-kit", "push", "--config=drizzle.config.ts"], {
    cwd: REPO_ROOT,
    env: { ...process.env, KIOSK_DB_PATH: dbPath },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`drizzle-kit push failed (exit ${exitCode}): ${stderr.trim()}`);
  }
}
