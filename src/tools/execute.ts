import { runCodex } from "../lib/codex-runner.ts";
import { logRun, makeRunId } from "../lib/logger.ts";
import type { ExecuteParams, ExecuteResult } from "../types.ts";

const MAX_RETRIES = 1;

export type ProgressCallback = (message: string) => void;

export async function codexExecute(params: ExecuteParams, onProgress?: ProgressCallback): Promise<ExecuteResult> {
  const runId = makeRunId();
  const startedAt = new Date().toISOString();

  let result = await runCodex(params, onProgress);

  if (!result.success && MAX_RETRIES > 0) {
    onProgress?.("Execution failed, retrying...");
    result = await runCodex(params, onProgress);
  }

  const finishedAt = new Date().toISOString();

  await logRun({
    id: runId,
    tool: "codex_execute",
    params: params as unknown as Record<string, unknown>,
    result,
    started_at: startedAt,
    finished_at: finishedAt,
  }).catch(() => {});

  return result;
}
