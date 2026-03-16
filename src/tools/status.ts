import type { StatusResult } from "../types.ts";

export async function codexStatus(): Promise<StatusResult> {
  // Check if codex CLI is installed
  try {
    const versionProc = Bun.spawn(["codex", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const versionOut = await new Response(versionProc.stdout).text();
    const versionErr = await new Response(versionProc.stderr).text();
    const versionCode = await versionProc.exited;

    if (versionCode !== 0) {
      return {
        installed: false,
        authenticated: false,
        error: `codex --version failed: ${versionErr.trim()}`,
      };
    }

    const version = versionOut.trim() || versionErr.trim();

    // Check authentication by attempting a trivial exec
    // We just verify the API key env var exists rather than burning tokens
    const hasApiKey = !!(
      process.env.OPENAI_API_KEY ||
      process.env.CODEX_API_KEY
    );

    return {
      installed: true,
      version,
      authenticated: hasApiKey,
      config: {
        OPENAI_API_KEY: hasApiKey ? "set" : "not set",
      },
    };
  } catch (err: unknown) {
    return {
      installed: false,
      authenticated: false,
      error: `Could not find codex CLI: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
