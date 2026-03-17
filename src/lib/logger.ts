import { join } from "path";
import { homedir } from "os";
import { readdir, unlink, stat, appendFile, writeFile } from "fs/promises";
import type { RunLog } from "../types.ts";

const LOG_DIR = join(homedir(), ".synapse", "logs");
const MAX_LOG_AGE_MS = 24 * 60 * 60 * 1000;

async function ensureLogDir(): Promise<void> {
  await Bun.write(join(LOG_DIR, ".keep"), "");
}

async function pruneOldLogs(): Promise<void> {
  try {
    const files = await readdir(LOG_DIR);
    const now = Date.now();
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = join(LOG_DIR, file);
      const info = await stat(filePath);
      if (now - info.mtimeMs > MAX_LOG_AGE_MS) {
        await unlink(filePath);
      }
    }
  } catch {}
}

export async function logRun(log: RunLog): Promise<string> {
  await ensureLogDir();
  const filename = `${log.started_at.replace(/[:.]/g, "-")}_${log.tool}_${log.id}.json`;
  const path = join(LOG_DIR, filename);
  await Bun.write(path, JSON.stringify(log, null, 2));
  pruneOldLogs().catch(() => {});
  return path;
}

const LIVE_LOG = join(LOG_DIR, "live.log");

export async function logLive(message: string): Promise<void> {
  await ensureLogDir();
  const timestamp = new Date().toISOString().slice(11, 19);
  await appendFile(LIVE_LOG, `[${timestamp}] ${message}\n`);
}

export async function clearLiveLog(): Promise<void> {
  await ensureLogDir();
  await writeFile(LIVE_LOG, "");
}

export function makeRunId(): string {
  return crypto.randomUUID().slice(0, 8);
}
