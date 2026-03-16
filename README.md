# Synapse

> Where Claude's thought becomes Codex's code

An MCP server that lets Claude Code delegate coding tasks to OpenAI's Codex CLI. Claude is the architect. Codex is the specialist coder. Synapse is the bridge.

## How it works

```
Claude Code (big context, planning)
    → Synapse (MCP server)
        → Codex CLI (focused code generation)
```

Claude Code keeps the big picture — project memory, architecture decisions, multi-file awareness. Codex gets lean, focused prompts with just enough context to write code. Synapse handles execution, retries, validation, and reporting.

## Prerequisites

- [Bun](https://bun.sh) runtime
- [Codex CLI](https://github.com/openai/codex) installed and on PATH
- `OPENAI_API_KEY` environment variable set

## Setup

```bash
# Clone and install
git clone <repo-url> synapse
cd synapse
bun install
```

### Add to Claude Code

Add synapse to your Claude Code MCP config. Edit `~/.claude.json` (or your project's `.mcp.json`):

```json
{
  "mcpServers": {
    "synapse": {
      "command": "bun",
      "args": ["run", "/path/to/synapse/src/index.ts"],
      "env": {
        "OPENAI_API_KEY": "your-key-here"
      }
    }
  }
}
```

Or via Claude Code CLI:

```bash
claude mcp add synapse -- bun run /path/to/synapse/src/index.ts
```

## MCP Tools

### `codex_status`

Health check. Verifies Codex CLI is installed and authenticated.

### `codex_execute`

Run a single coding task.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `task` | string | yes | Concise task description |
| `working_directory` | string | no | Repo/directory to run in |
| `relevant_files` | string[] | no | Files Codex should focus on |
| `model` | string | no | Override the Codex model |
| `timeout_ms` | number | no | Timeout (default: 5 min) |
| `full_auto` | boolean | no | Full-auto mode (default: true) |
| `sandbox` | string | no | Sandbox mode (default: workspace-write) |

Returns: output text, files changed, errors, timing.

### `codex_execute_plan`

Run a multi-step plan with dependency tracking and optional validation.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `plan` | PlanStep[] | yes | Steps with id, task, depends_on, validation |
| `working_directory` | string | yes | Repo/directory to run in |
| `model` | string | no | Override the Codex model |
| `parallel` | boolean | no | Run independent steps concurrently (default: true) |
| `stop_on_failure` | boolean | no | Stop on failure after retry (default: true) |
| `timeout_ms` | number | no | Per-step timeout |

Each `PlanStep`:
```typescript
{
  id: string;           // unique step ID
  task: string;         // what to do
  depends_on?: string[];  // step IDs to wait for
  relevant_files?: string[];
  validation?: string;  // e.g. "bun test", "tsc --noEmit"
}
```

Returns: per-step results with status, output, files changed, validation output, and timing.

## Design Principles

- **Lean prompts**: Codex has a small context window. Synapse keeps prompts concise and reserves context for reasoning.
- **Claude keeps the big picture**: Synapse doesn't try to be smart — it faithfully executes and reports.
- **Retry then surface**: One automatic retry on failure, then the error is surfaced for Claude Code to handle.
- **Logs everything**: All runs logged to `~/.synapse/logs/` for debugging.

## Logs

Run logs are stored in `~/.synapse/logs/` as JSON files with timestamps, parameters, and full results.

## License

MIT
