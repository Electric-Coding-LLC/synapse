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

      // Collect streamed text deltas
      if (evt.type === "message.output_text.delta" && typeof evt.delta === "string") {
        textParts.push(evt.delta);
      }

      // Or grab the full text from the completed message
      if (evt.type === "message.completed" && evt.message?.output_text) {
        // If we already collected deltas, prefer those. Otherwise use the full text.
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
    text: textParts.join(""),
    events,
  };
}
