import { readFile, stat } from "fs/promises";
import { join, relative } from "path";

/**
 * Approximate context budget for Codex prompts.
 *
 * Codex has a ~192k context window but we want to reserve at least half for
 * reasoning + generation. So we budget ~80k chars (~20k tokens) for our prompt
 * content including file snippets.
 */
const MAX_PROMPT_CHARS = 80_000;

/**
 * Build a lean prompt for codex exec.
 *
 * Keeps things concise — task description + optional file context
 * trimmed to stay within budget.
 */
export async function buildPrompt(
  task: string,
  relevantFiles?: string[],
  workingDirectory?: string,
): Promise<string> {
  const parts: string[] = [];
  parts.push("$flow");
  parts.push(task);

  if (!relevantFiles?.length) {
    return parts.join("\n\n");
  }

  let charBudget = MAX_PROMPT_CHARS - task.length - 200; // reserve for framing

  const fileSection: string[] = [];
  fileSection.push("## Relevant files");

  for (const filePath of relevantFiles) {
    const absPath = workingDirectory ? join(workingDirectory, filePath) : filePath;

    try {
      const info = await stat(absPath);
      if (info.size > 50_000) {
        // Too big — just mention the file path
        fileSection.push(`- \`${filePath}\` (large file, ${Math.round(info.size / 1024)}KB — read it yourself)`);
        continue;
      }

      const content = await readFile(absPath, "utf-8");

      if (content.length > charBudget) {
        // Include a truncated snippet
        const snippet = content.slice(0, Math.min(charBudget, 2000));
        fileSection.push(`### ${filePath} (truncated)`);
        fileSection.push("```");
        fileSection.push(snippet);
        fileSection.push("```");
        charBudget = 0;
        break;
      }

      fileSection.push(`### ${filePath}`);
      fileSection.push("```");
      fileSection.push(content);
      fileSection.push("```");
      charBudget -= content.length;
    } catch {
      fileSection.push(`- \`${filePath}\` (could not read)`);
    }
  }

  parts.push(fileSection.join("\n"));
  return parts.join("\n\n");
}
