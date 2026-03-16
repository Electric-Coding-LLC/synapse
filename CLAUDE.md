# Synapse

MCP server that bridges Claude Code to OpenAI's Codex CLI. Bun runtime, no compile step.

## Stack

- **Runtime**: Bun (TypeScript executed directly, no build)
- **Protocol**: MCP via `@modelcontextprotocol/sdk` (StdioServerTransport)
- **Shell**: `Bun.spawn` to run `codex exec`

## Project Structure

- `src/index.ts` — MCP server entry point, tool registration
- `src/types.ts` — shared TypeScript types
- `src/tools/` — one file per MCP tool (status, execute, plan)
- `src/lib/` — internal modules (codex-runner, parser, context, logger)

## Commands

- `bun run src/index.ts` — start the MCP server
- `bun install` — install dependencies
- `bunx tsc --noEmit` — type check

## Conventions

- Use `.ts` extensions in all imports (Bun resolves them directly)
- No build/compile step — Bun runs TypeScript natively
- Keep Codex prompts lean (~80k char budget, ~50% of context reserved for Codex reasoning)
- Log all runs to `~/.synapse/logs/`
- Retry once on failure, then surface errors
