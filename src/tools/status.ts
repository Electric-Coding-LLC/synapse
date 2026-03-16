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

    // Check authentication via `codex login status`
    let authenticated = false;
    let authMethod = "none";

    const loginProc = Bun.spawn(["codex", "login", "status"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [loginOut, loginErr] = await Promise.all([
      new Response(loginProc.stdout).text(),
      new Response(loginProc.stderr).text(),
    ]);
    const loginCode = await loginProc.exited;
    const loginText = loginOut.trim() || loginErr.trim();

    if (loginCode === 0 && loginText) {
      const status = loginText.toLowerCase();
      if (status.includes("logged in")) {
        authenticated = true;
        if (status.includes("chatgpt")) {
          authMethod = "chatgpt";
        } else if (status.includes("api")) {
          authMethod = "api-key";
        } else {
          authMethod = "logged-in";
        }
      }
    }

    // Fall back to env var check
    if (!authenticated) {
      const hasApiKey = !!(process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY);
      if (hasApiKey) {
        authenticated = true;
        authMethod = "api-key";
      }
    }

    return {
      installed: true,
      version,
      authenticated,
      auth_method: authMethod,
    };
  } catch (err: unknown) {
    return {
      installed: false,
      authenticated: false,
      error: `Could not find codex CLI: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
