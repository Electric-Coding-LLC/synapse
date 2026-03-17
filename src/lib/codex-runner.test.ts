import { describe, test, expect } from "bun:test";
import { diffSnapshots } from "./codex-runner.ts";

describe("diffSnapshots", () => {
  test("detects no changes when snapshots are identical", () => {
    const snapshot = {
      tracked: new Map([["src/index.ts", "abc123"], ["src/types.ts", "def456"]]),
      untracked: new Set<string>(),
    };
    const result = diffSnapshots(snapshot, snapshot);
    expect(result).toEqual([]);
  });

  test("detects modified tracked files", () => {
    const before = {
      tracked: new Map([["src/index.ts", "abc123"]]),
      untracked: new Set<string>(),
    };
    const after = {
      tracked: new Map([["src/index.ts", "xyz789"]]),
      untracked: new Set<string>(),
    };
    const result = diffSnapshots(before, after);
    expect(result).toEqual([{ path: "src/index.ts", status: "modified" }]);
  });

  test("detects new tracked files", () => {
    const before = {
      tracked: new Map([["src/index.ts", "abc123"]]),
      untracked: new Set<string>(),
    };
    const after = {
      tracked: new Map([["src/index.ts", "abc123"], ["src/new.ts", "new123"]]),
      untracked: new Set<string>(),
    };
    const result = diffSnapshots(before, after);
    expect(result).toEqual([{ path: "src/new.ts", status: "added" }]);
  });

  test("detects deleted tracked files", () => {
    const before = {
      tracked: new Map([["src/index.ts", "abc123"], ["src/old.ts", "old123"]]),
      untracked: new Set<string>(),
    };
    const after = {
      tracked: new Map([["src/index.ts", "abc123"]]),
      untracked: new Set<string>(),
    };
    const result = diffSnapshots(before, after);
    expect(result).toEqual([{ path: "src/old.ts", status: "deleted" }]);
  });

  test("detects new untracked files", () => {
    const before = {
      tracked: new Map<string, string>(),
      untracked: new Set<string>(),
    };
    const after = {
      tracked: new Map<string, string>(),
      untracked: new Set(["tmp/debug.log"]),
    };
    const result = diffSnapshots(before, after);
    expect(result).toEqual([{ path: "tmp/debug.log", status: "added" }]);
  });

  test("ignores pre-existing untracked files", () => {
    const before = {
      tracked: new Map<string, string>(),
      untracked: new Set(["tmp/debug.log"]),
    };
    const after = {
      tracked: new Map<string, string>(),
      untracked: new Set(["tmp/debug.log"]),
    };
    const result = diffSnapshots(before, after);
    expect(result).toEqual([]);
  });

  test("detects multiple change types simultaneously", () => {
    const before = {
      tracked: new Map([["a.ts", "aaa"], ["b.ts", "bbb"], ["c.ts", "ccc"]]),
      untracked: new Set<string>(),
    };
    const after = {
      tracked: new Map([["a.ts", "aaa"], ["b.ts", "bbb_changed"], ["d.ts", "ddd"]]),
      untracked: new Set(["e.txt"]),
    };
    const result = diffSnapshots(before, after);
    expect(result).toContainEqual({ path: "b.ts", status: "modified" });
    expect(result).toContainEqual({ path: "d.ts", status: "added" });
    expect(result).toContainEqual({ path: "c.ts", status: "deleted" });
    expect(result).toContainEqual({ path: "e.txt", status: "added" });
    expect(result).toHaveLength(4);
  });

  test("ignores pre-existing dirty files", () => {
    const before = {
      tracked: new Map([["src/index.ts", "dirty:src/index.ts"]]),
      untracked: new Set<string>(),
    };
    const after = {
      tracked: new Map([["src/index.ts", "dirty:src/index.ts"]]),
      untracked: new Set<string>(),
    };
    const result = diffSnapshots(before, after);
    expect(result).toEqual([]);
  });
});
