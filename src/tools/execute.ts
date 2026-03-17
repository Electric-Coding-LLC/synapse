import { runCodex } from "../lib/codex-runner.ts";
import { logRun, makeRunId } from "../lib/logger.ts";
import type { ExecuteParams, ExecuteResult } from "../types.ts";

const MAX_RETRIES = 1;

export type ProgressCallback = (message: string) => void;

export async function codexExecute(params: ExecuteParams, onProgress?: ProgressCallback): Promise<ExecuteResult> {
  const runId = makeRunId();
  const startedAt = new Date().toISOString();

  onProgress?.(`Executing: ${params.task.slice(0, 80)}`);
  const execStart = Date.now();
  const heartbeat = onProgress
    ? setInterval(() => {
        const elapsed = Math.round((Date.now() - execStart) / 1000);
        onProgress(`Codex working... (${elapsed}s elapsed)`);
      }, 15_000)
    : undefined;

  let result = await runCodex(params);
  if (heartbeat) clearInterval(heartbeat);

  if (!result.success && MAX_RETRIES > 0) {
    onProgress?.("Execution failed, retrying...");
    result = await runCodex(params);
  }

  const finishedAt = new Date().toISOString();

  // Log the run
  await logRun({
    id: runId,
    tool: "codex_execute",
    params: params as unknown as Record<string, unknown>,
    result,
    started_at: startedAt,
    finished_at: finishedAt,
  }).catch(() => {}); // don't fail the tool if logging fails

  return result;
}
