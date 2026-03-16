import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { buildPrompt } from "./context.ts";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "synapse-test-"));
  await writeFile(join(tempDir, "small.ts"), 'export const x = 1;\n');
  await writeFile(join(tempDir, "medium.ts"), "// medium file\n".repeat(100));
  await writeFile(join(tempDir, "large.bin"), "x".repeat(60_000));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("buildPrompt", () => {
  test("returns task only when no files provided", async () => {
    const result = await buildPrompt("Fix the bug");
    expect(result).toBe("Fix the bug");
  });

  test("returns task only when files array is empty", async () => {
    const result = await buildPrompt("Fix the bug", [], tempDir);
    expect(result).toBe("Fix the bug");
  });

  test("includes file content for small files", async () => {
    const result = await buildPrompt("Fix the bug", ["small.ts"], tempDir);
    expect(result).toContain("Fix the bug");
    expect(result).toContain("## Relevant files");
    expect(result).toContain("### small.ts");
    expect(result).toContain("export const x = 1;");
  });

  test("marks large files without including content", async () => {
    const result = await buildPrompt("Fix the bug", ["large.bin"], tempDir);
    expect(result).toContain("large.bin");
    expect(result).toContain("large file");
    expect(result).toContain("read it yourself");
    // Should not contain the actual 60k of content
    expect(result.length).toBeLessThan(1000);
  });

  test("handles missing files gracefully", async () => {
    const result = await buildPrompt("Fix the bug", ["nonexistent.ts"], tempDir);
    expect(result).toContain("nonexistent.ts");
    expect(result).toContain("could not read");
  });

  test("includes multiple files", async () => {
    const result = await buildPrompt("Fix the bug", ["small.ts", "medium.ts"], tempDir);
    expect(result).toContain("### small.ts");
    expect(result).toContain("### medium.ts");
  });

  test("stays within character budget", async () => {
    // Create many medium files to exceed budget
    const files: string[] = [];
    for (let i = 0; i < 20; i++) {
      const name = `budget-${i}.ts`;
      await writeFile(join(tempDir, name), "a".repeat(10_000));
      files.push(name);
    }

    const result = await buildPrompt("Task", files, tempDir);
    // 80k budget + task + framing
    expect(result.length).toBeLessThan(85_000);
  });
});
