import { runCodex } from "../lib/codex-runner.ts";
import { logRun, makeRunId } from "../lib/logger.ts";
import type { ExecuteParams, ExecuteResult } from "../types.ts";

const MAX_RETRIES = 1;

export async function codexExecute(params: ExecuteParams): Promise<ExecuteResult> {
  const runId = makeRunId();
  const startedAt = new Date().toISOString();

  let result = await runCodex(params);

  // Retry once on failure
  if (!result.success && MAX_RETRIES > 0) {
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
