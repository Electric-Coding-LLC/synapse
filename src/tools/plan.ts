import { runCodex, runValidation } from "../lib/codex-runner.ts";
import { logRun, makeRunId } from "../lib/logger.ts";
import { findReadySteps, validateDependencies } from "../lib/graph.ts";
import type { PlanParams, PlanResult, StepResult } from "../types.ts";

export type ProgressCallback = (message: string) => void;

export async function codexExecutePlan(params: PlanParams, onProgress?: ProgressCallback): Promise<PlanResult> {
  const runId = makeRunId();
  const startedAt = new Date().toISOString();
  const planStart = Date.now();

  const { plan, working_directory, model, parallel = true, stop_on_failure = true, timeout_ms } = params;

  const stepResults = new Map<string, StepResult>();
  const completed = new Set<string>();
  let aborted = false;

  async function executeStep(step: typeof plan[number]): Promise<StepResult> {
    if (aborted) {
      return {
        step_id: step.id,
        status: "skipped",
        output: "Plan aborted due to prior failure",
        files_changed: [],
        duration_ms: 0,
      };
    }

    onProgress?.(`Step "${step.id}" started: ${step.task.slice(0, 80)}`);

    const result = await runCodex({
      task: step.task,
      working_directory,
      relevant_files: step.relevant_files,
      model,
      timeout_ms,
      full_auto: true,
    });

    let stepResult: StepResult;

    if (!result.success) {
      onProgress?.(`Step "${step.id}" failed, retrying...`);
      const retry = await runCodex({
        task: step.task,
        working_directory,
        relevant_files: step.relevant_files,
        model,
        timeout_ms,
        full_auto: true,
      });

      if (!retry.success) {
        stepResult = {
          step_id: step.id,
          status: "failed",
          output: retry.output,
          files_changed: retry.files_changed,
          error: retry.error,
          duration_ms: result.duration_ms + retry.duration_ms,
        };

        if (stop_on_failure) aborted = true;
        return stepResult;
      }

      result.output = retry.output;
      result.files_changed = retry.files_changed;
      result.duration_ms += retry.duration_ms;
      result.success = true;
    }

    // Run validation if specified
    if (step.validation) {
      const val = await runValidation(step.validation, working_directory);
      if (!val.success) {
        stepResult = {
          step_id: step.id,
          status: "validation_failed",
          output: result.output,
          files_changed: result.files_changed,
          error: `Validation failed: ${step.validation}`,
          validation_output: val.output,
          duration_ms: result.duration_ms,
        };

        if (stop_on_failure) aborted = true;
        return stepResult;
      }

      return {
        step_id: step.id,
        status: "success",
        output: result.output,
        files_changed: result.files_changed,
        duration_ms: result.duration_ms,
        validation_output: val.output,
      };
    }

    onProgress?.(`Step "${step.id}" succeeded (${(result.duration_ms / 1000).toFixed(1)}s)`);

    return {
      step_id: step.id,
      status: "success",
      output: result.output,
      files_changed: result.files_changed,
      duration_ms: result.duration_ms,
    };
  }

  const validation = validateDependencies(plan);
  if (!validation.valid) {
    return {
      success: false,
      steps: [],
      total_duration_ms: 0,
      summary: `Invalid plan: ${validation.errors.join("; ")}`,
    };
  }

  if (parallel) {
    const pending = new Set(plan.map((s) => s.id));
    const stepMap = new Map(plan.map((s) => [s.id, s]));

    while (pending.size > 0 && !aborted) {
      const { ready, deadlocked } = findReadySteps(plan, pending, completed);

      if (deadlocked.length > 0) {
        for (const id of deadlocked) {
          stepResults.set(id, {
            step_id: id,
            status: "skipped",
            output: "Unmet dependencies — possible circular dependency",
            files_changed: [],
            duration_ms: 0,
          });
        }
        break;
      }

      const readySteps = ready.map((id) => stepMap.get(id)!);
      const results = await Promise.all(readySteps.map(executeStep));

      for (const r of results) {
        stepResults.set(r.step_id, r);
        completed.add(r.step_id);
        pending.delete(r.step_id);
      }
    }
  } else {
    // Sequential execution in plan order
    for (const step of plan) {
      const deps = step.depends_on ?? [];
      const depsMet = deps.every((d) => {
        const dr = stepResults.get(d);
        return dr?.status === "success";
      });

      if (!depsMet) {
        stepResults.set(step.id, {
          step_id: step.id,
          status: "skipped",
          output: "Skipped — dependency failed",
          files_changed: [],
          duration_ms: 0,
        });
        continue;
      }

      const r = await executeStep(step);
      stepResults.set(r.step_id, r);
      completed.add(r.step_id);
    }
  }

  const steps = plan.map((s) => stepResults.get(s.id)!).filter(Boolean);
  const allSuccess = steps.every((s) => s.status === "success");
  const totalDuration = Date.now() - planStart;

  const succeeded = steps.filter((s) => s.status === "success").length;
  const failed = steps.filter((s) => s.status === "failed" || s.status === "validation_failed").length;
  const skipped = steps.filter((s) => s.status === "skipped").length;

  const result: PlanResult = {
    success: allSuccess,
    steps,
    total_duration_ms: totalDuration,
    summary: `${succeeded}/${steps.length} steps succeeded, ${failed} failed, ${skipped} skipped (${(totalDuration / 1000).toFixed(1)}s)`,
  };

  const finishedAt = new Date().toISOString();
  await logRun({
    id: runId,
    tool: "codex_execute_plan",
    params: params as unknown as Record<string, unknown>,
    result,
    started_at: startedAt,
    finished_at: finishedAt,
  }).catch(() => {});

  return result;
}
