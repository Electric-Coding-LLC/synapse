#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { codexStatus } from "./tools/status.ts";
import { codexExecute } from "./tools/execute.ts";
import { codexExecutePlan } from "./tools/plan.ts";

const server = new McpServer({
  name: "synapse",
  version: "0.1.0",
});

// ── codex_status ─────────────────────────────────────────────────────

server.tool(
  "codex_status",
  "Health check — verify Codex CLI is installed, authenticated, and working",
  {},
  async () => {
    const result = await codexStatus();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ── codex_execute ────────────────────────────────────────────────────

server.tool(
  "codex_execute",
  "Run a single coding task via Codex CLI. Keep task descriptions concise — Codex has a small context window.",
  {
    task: z.string().describe("The coding task description — kept concise"),
    working_directory: z.string().optional().describe("Repo/directory to run in"),
    relevant_files: z.array(z.string()).optional().describe("Files Codex should focus on"),
    model: z.string().optional().describe("Override the Codex model"),
    timeout_ms: z.number().optional().describe("Timeout in ms (default: 5 min)"),
    full_auto: z.boolean().optional().default(true).describe("Run in full-auto mode"),
    sandbox: z.string().optional().describe("Sandbox mode (default: workspace-write)"),
  },
  async ({ task, working_directory, relevant_files, model, timeout_ms, full_auto, sandbox }) => {
    const result = await codexExecute({
      task,
      working_directory,
      relevant_files,
      model,
      timeout_ms,
      full_auto,
      sandbox,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ── codex_execute_plan ───────────────────────────────────────────────

const planStepSchema = z.object({
  id: z.string().describe("Unique step identifier"),
  task: z.string().describe("The coding task for this step"),
  depends_on: z.array(z.string()).optional().describe("Step IDs this step depends on"),
  relevant_files: z.array(z.string()).optional().describe("Files relevant to this step"),
  validation: z.string().optional().describe("Validation command (e.g. 'bun test', 'tsc --noEmit')"),
});

server.tool(
  "codex_execute_plan",
  "Run a multi-step coding plan via Codex CLI. Steps can run in parallel when dependencies allow.",
  {
    plan: z.array(planStepSchema).describe("Array of plan steps to execute"),
    working_directory: z.string().describe("Repo/directory to run in"),
    model: z.string().optional().describe("Override the Codex model"),
    parallel: z.boolean().optional().default(true).describe("Run independent steps concurrently"),
    stop_on_failure: z.boolean().optional().default(true).describe("Stop plan if a step fails after retry"),
    timeout_ms: z.number().optional().describe("Per-step timeout in ms"),
  },
  async ({ plan, working_directory, model, parallel, stop_on_failure, timeout_ms }) => {
    const result = await codexExecutePlan(
      {
        plan,
        working_directory,
        model,
        parallel,
        stop_on_failure,
        timeout_ms,
      },
      (message) => {
        server.sendLoggingMessage({ level: "info", data: message }).catch(() => {});
      },
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ── Start server ─────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Synapse failed to start:", err);
  process.exit(1);
});
