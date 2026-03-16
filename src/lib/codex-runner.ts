import { parseJsonlOutput } from "./parser.ts";
import { buildPrompt } from "./context.ts";
import type { ExecuteParams, ExecuteResult, FileChange } from "../types.ts";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_SANDBOX = "workspace-write";

/**
 * Detect file changes by comparing `git status` before and after execution.
 */
async function detectFileChanges(cwd: string): Promise<FileChange[]> {
  try {
    const proc = Bun.spawn(["git", "diff", "--name-status", "HEAD"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;

    const changes: FileChange[] = [];
    for (const line of out.trim().split("\n")) {
      if (!line.trim()) continue;
      const [statusChar, ...pathParts] = line.split("\t");
      const path = pathParts.join("\t");
      const status =
        statusChar === "A" ? "added" :
        statusChar === "D" ? "deleted" :
        "modified";
      changes.push({ path, status });
    }

    // Also pick up untracked files
    const untrackedProc = Bun.spawn(["git", "ls-files", "--others", "--exclude-standard"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const untrackedOut = await new Response(untrackedProc.stdout).text();
    await untrackedProc.exited;

    for (const line of untrackedOut.trim().split("\n")) {
      if (!line.trim()) continue;
      if (!changes.some((c) => c.path === line)) {
        changes.push({ path: line, status: "added" });
      }
    }

    return changes;
  } catch {
    return [];
  }
}

/**
 * Run a single coding task via `codex exec`.
 */
export async function runCodex(params: ExecuteParams): Promise<ExecuteResult> {
  const start = Date.now();
  const cwd = params.working_directory || process.cwd();
  const timeout = params.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const sandbox = params.sandbox ?? DEFAULT_SANDBOX;
  const fullAuto = params.full_auto ?? true;

  const prompt = await buildPrompt(params.task, params.relevant_files, cwd);

  // Snapshot git state before (to diff later)
  const preChanges = await detectFileChanges(cwd);

  const args: string[] = ["codex", "exec"];

  if (fullAuto) {
    args.push("--full-auto");
  }

  if (params.model) {
    args.push("-m", params.model);
  }

  args.push("-s", sandbox);
  args.push("--json");
  args.push(prompt);

  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;

  try {
    const proc = Bun.spawn(args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      proc.kill("SIGTERM");
    }, timeout);

    const [outText, errText] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    exitCode = await proc.exited;
    clearTimeout(timeoutId);

    stdout = outText;
    stderr = errText;
  } catch (err: unknown) {
    const duration = Date.now() - start;
    return {
      success: false,
      output: "",
      files_changed: [],
      error: `Failed to spawn codex: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: duration,
      exit_code: null,
    };
  }

  const postChanges = await detectFileChanges(cwd);

  // Find new changes (files that changed after but not before)
  const preSet = new Set(preChanges.map((c) => `${c.status}:${c.path}`));
  const newChanges = postChanges.filter((c) => !preSet.has(`${c.status}:${c.path}`));

  const parsed = parseJsonlOutput(stdout);
  const output = parsed.text || stdout;

  const duration = Date.now() - start;
  const success = exitCode === 0;

  return {
    success,
    output: success ? output : `${output}\n\nSTDERR:\n${stderr}`.trim(),
    files_changed: newChanges.length > 0 ? newChanges : postChanges,
    error: success ? undefined : `Exit code ${exitCode}: ${stderr}`.trim(),
    duration_ms: duration,
    exit_code: exitCode,
  };
}

/**
 * Run a validation command (e.g. `bun test`, `tsc --noEmit`).
 */
export async function runValidation(
  command: string,
  cwd: string,
  timeoutMs: number = 60_000,
): Promise<{ success: boolean; output: string }> {
  try {
    const parts = command.split(" ");
    const proc = Bun.spawn(parts, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeoutId = setTimeout(() => proc.kill("SIGTERM"), timeoutMs);

    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const code = await proc.exited;
    clearTimeout(timeoutId);

    return {
      success: code === 0,
      output: `${out}\n${err}`.trim(),
    };
  } catch (e: unknown) {
    return {
      success: false,
      output: `Validation failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
