import { parseJsonlOutput } from "./parser.ts";
import { buildPrompt } from "./context.ts";
import { logLive, clearLiveLog } from "./logger.ts";
import type { ExecuteParams, ExecuteResult, FileChange } from "../types.ts";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_SANDBOX = "workspace-write";

/**
 * Snapshot the working tree: file hashes for tracked files + set of untracked files.
 * Used to diff before/after Codex execution so we only report what Codex changed.
 */
async function snapshotWorkingTree(cwd: string): Promise<{ tracked: Map<string, string>; untracked: Set<string> }> {
  const tracked = new Map<string, string>();
  const untracked = new Set<string>();

  try {
    const hashProc = Bun.spawn(["git", "ls-files", "-s"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const hashOut = await new Response(hashProc.stdout).text();
    await hashProc.exited;

    for (const line of hashOut.trim().split("\n")) {
      if (!line.trim()) continue;
      const match = line.match(/^\d+\s+([a-f0-9]+)\s+\d+\t(.+)$/);
      if (match) tracked.set(match[2], match[1]);
    }

    const diffProc = Bun.spawn(["git", "diff", "--name-only"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const diffOut = await new Response(diffProc.stdout).text();
    await diffProc.exited;

    for (const file of diffOut.trim().split("\n")) {
      if (file.trim()) tracked.set(file, `dirty:${file}`);
    }

    const untrackedProc = Bun.spawn(["git", "ls-files", "--others", "--exclude-standard"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const untrackedOut = await new Response(untrackedProc.stdout).text();
    await untrackedProc.exited;

    for (const line of untrackedOut.trim().split("\n")) {
      if (line.trim()) untracked.add(line);
    }
  } catch {}

  return { tracked, untracked };
}

/**
 * Diff two snapshots to find what changed between them.
 */
export function diffSnapshots(
  before: { tracked: Map<string, string>; untracked: Set<string> },
  after: { tracked: Map<string, string>; untracked: Set<string> },
): FileChange[] {
  const changes: FileChange[] = [];

  for (const [path, hash] of after.tracked) {
    const prevHash = before.tracked.get(path);
    if (prevHash === undefined) {
      changes.push({ path, status: "added" });
    } else if (prevHash !== hash) {
      changes.push({ path, status: "modified" });
    }
  }

  for (const path of before.tracked.keys()) {
    if (!after.tracked.has(path)) {
      changes.push({ path, status: "deleted" });
    }
  }

  for (const path of after.untracked) {
    if (!before.untracked.has(path)) {
      changes.push({ path, status: "added" });
    }
  }

  return changes;
}

/**
 * Run a single coding task via `codex exec`.
 */
export type ProgressCallback = (message: string) => void;

export async function runCodex(params: ExecuteParams, onProgress?: ProgressCallback): Promise<ExecuteResult> {
  const start = Date.now();
  const cwd = params.working_directory || process.cwd();
  const timeout = params.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const sandbox = params.sandbox ?? DEFAULT_SANDBOX;
  const fullAuto = params.full_auto ?? true;

  const prompt = await buildPrompt(params.task, params.relevant_files, cwd);

  await clearLiveLog().catch(() => {});
  await logLive(`Task: ${params.task.slice(0, 200)}`).catch(() => {});

  const preSnapshot = await snapshotWorkingTree(cwd);

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

    const timeoutId = setTimeout(() => {
      proc.kill("SIGTERM");
    }, timeout);

    const stderrPromise = new Response(proc.stderr).text();

    // Stream stdout line-by-line for real-time progress
    let buffer = "";
    for await (const chunk of proc.stdout) {
      const text = new TextDecoder().decode(chunk);
      buffer += text;

      // Process complete lines
      let newlineIdx;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        stdout += line + "\n";

        if (line.trim()) {
          try {
            const evt = JSON.parse(line);
            if (evt.type === "item.completed" && evt.item?.type === "agent_message" && evt.item.text) {
              const msg = `Codex: ${evt.item.text.slice(0, 200)}`;
              onProgress?.(msg);
              logLive(msg).catch(() => {});
            } else if (evt.type === "item.completed" && evt.item?.type === "command_execution" && evt.item.command) {
              const cmd = evt.item.command.length > 100 ? evt.item.command.slice(0, 100) + "..." : evt.item.command;
              const status = evt.item.exit_code === 0 ? "ok" : `exit ${evt.item.exit_code}`;
              const msg = `Codex ran: ${cmd} (${status})`;
              onProgress?.(msg);
              logLive(msg).catch(() => {});
            } else if (evt.type === "turn.started") {
              logLive("── turn started ──").catch(() => {});
            } else if (evt.type === "turn.completed" && evt.usage) {
              logLive(`── turn completed (${evt.usage.input_tokens} in, ${evt.usage.output_tokens} out) ──`).catch(() => {});
            }
          } catch {}
        }
      }
    }
    if (buffer.trim()) {
      stdout += buffer;
    }

    stderr = await stderrPromise;
    exitCode = await proc.exited;
    clearTimeout(timeoutId);
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

  const postSnapshot = await snapshotWorkingTree(cwd);
  const filesChanged = diffSnapshots(preSnapshot, postSnapshot);

  const parsed = parseJsonlOutput(stdout);
  const rawOutput = parsed.text || stdout;
  const MAX_OUTPUT = 2000;
  const output = rawOutput.length > MAX_OUTPUT
    ? rawOutput.slice(0, MAX_OUTPUT) + `... (truncated, ${rawOutput.length} chars total)`
    : rawOutput;

  const duration = Date.now() - start;
  const success = exitCode === 0;

  return {
    success,
    output: success ? output : `${output}\n\nSTDERR:\n${stderr}`.trim(),
    files_changed: filesChanged,
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
