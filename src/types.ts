// ── Codex JSONL event types ──────────────────────────────────────────

export type CodexEventType =
  | "message.created"
  | "message.output_text.delta"
  | "message.output_text.done"
  | "message.completed"
  | "response.completed";

export interface CodexEvent {
  type: CodexEventType;
  [key: string]: unknown;
}

// ── codex_execute ────────────────────────────────────────────────────

export interface ExecuteParams {
  task: string;
  working_directory?: string;
  relevant_files?: string[];
  model?: string;
  timeout_ms?: number;
  full_auto?: boolean;
  sandbox?: string;
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
}

export interface ExecuteResult {
  success: boolean;
  output: string;
  files_changed: FileChange[];
  error?: string;
  duration_ms: number;
  exit_code: number | null;
}

// ── codex_execute_plan ───────────────────────────────────────────────

export interface PlanStep {
  id: string;
  task: string;
  depends_on?: string[];
  relevant_files?: string[];
  validation?: string;
}

export interface PlanParams {
  plan: PlanStep[];
  working_directory: string;
  model?: string;
  parallel?: boolean;
  stop_on_failure?: boolean;
  timeout_ms?: number;
}

export interface StepResult {
  step_id: string;
  status: "success" | "failed" | "skipped" | "validation_failed";
  output: string;
  files_changed: FileChange[];
  error?: string;
  duration_ms: number;
  validation_output?: string;
}

export interface PlanResult {
  success: boolean;
  steps: StepResult[];
  total_duration_ms: number;
  summary: string;
}

// ── codex_status ─────────────────────────────────────────────────────

export interface StatusResult {
  installed: boolean;
  version?: string;
  authenticated: boolean;
  config?: Record<string, unknown>;
  error?: string;
}

// ── Logger ───────────────────────────────────────────────────────────

export interface RunLog {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  result: unknown;
  started_at: string;
  finished_at: string;
}
