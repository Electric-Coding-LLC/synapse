import { join } from "path";
import { homedir } from "os";
import type { RunLog } from "../types.ts";

const LOG_DIR = join(homedir(), ".synapse", "logs");

async function ensureLogDir(): Promise<void> {
  await Bun.write(join(LOG_DIR, ".keep"), "");
}

export async function logRun(log: RunLog): Promise<string> {
  await ensureLogDir();
  const filename = `${log.started_at.replace(/[:.]/g, "-")}_${log.tool}_${log.id}.json`;
  const path = join(LOG_DIR, filename);
  await Bun.write(path, JSON.stringify(log, null, 2));
  return path;
}

export function makeRunId(): string {
  return crypto.randomUUID().slice(0, 8);
}
