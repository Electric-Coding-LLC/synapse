/**
 * Parse JSONL output from `codex exec --json`.
 *
 * Codex streams newline-delimited JSON events. We collect the ones we care
 * about and extract the final assistant message plus any file-change info.
 */

export interface ParsedOutput {
  /** The final assistant text (concatenated deltas). */
  text: string;
  /** Raw events for debugging. */
  events: unknown[];
}

export function parseJsonlOutput(raw: string): ParsedOutput {
  const lines = raw.split("\n").filter((l) => l.trim());
  const events: unknown[] = [];
  const textParts: string[] = [];

  for (const line of lines) {
    try {
      const evt = JSON.parse(line);
      events.push(evt);

      // Codex exec --json emits item.completed events with agent messages
      if (evt.type === "item.completed" && evt.item?.type === "agent_message" && typeof evt.item.text === "string") {
        textParts.push(evt.item.text);
      }

      // Also collect command execution output
      if (evt.type === "item.completed" && evt.item?.type === "command_execution" && typeof evt.item.aggregated_output === "string") {
        if (evt.item.aggregated_output.trim()) {
          textParts.push(`[command: ${evt.item.command}]\n${evt.item.aggregated_output.trim()}`);
        }
      }

      // Legacy: streamed text deltas (older Codex versions)
      if (evt.type === "message.output_text.delta" && typeof evt.delta === "string") {
        textParts.push(evt.delta);
      }

      // Legacy: completed message (older Codex versions)
      if (evt.type === "message.completed" && evt.message?.output_text) {
        if (textParts.length === 0) {
          textParts.push(evt.message.output_text);
        }
      }
    } catch {
      // Non-JSON lines (e.g. codex status output) — treat as plain text
      textParts.push(line);
    }
  }

  return {
    text: textParts.join("\n"),
    events,
  };
}
