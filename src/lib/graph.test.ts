import { describe, test, expect } from "bun:test";
import { findReadySteps, validateDependencies, detectCycles, topologicalOrder } from "./graph.ts";
import type { PlanStep } from "../types.ts";

const step = (id: string, depends_on?: string[]): PlanStep => ({
  id,
  task: `Task ${id}`,
  depends_on,
});

describe("findReadySteps", () => {
  test("all steps ready when no dependencies", () => {
    const steps = [step("a"), step("b"), step("c")];
    const result = findReadySteps(steps, new Set(["a", "b", "c"]), new Set());
    expect(result.ready.sort()).toEqual(["a", "b", "c"]);
    expect(result.deadlocked).toEqual([]);
  });

  test("step ready when all deps completed", () => {
    const steps = [step("a"), step("b", ["a"]), step("c", ["a", "b"])];
    const result = findReadySteps(steps, new Set(["b", "c"]), new Set(["a"]));
    expect(result.ready).toEqual(["b"]);
  });

  test("step not ready when deps incomplete", () => {
    const steps = [step("a"), step("b", ["a"])];
    const result = findReadySteps(steps, new Set(["a", "b"]), new Set());
    expect(result.ready).toEqual(["a"]);
  });

  test("detects deadlock with circular deps", () => {
    const steps = [step("a", ["b"]), step("b", ["a"])];
    const result = findReadySteps(steps, new Set(["a", "b"]), new Set());
    expect(result.ready).toEqual([]);
    expect(result.deadlocked.sort()).toEqual(["a", "b"]);
  });

  test("returns empty when nothing pending", () => {
    const steps = [step("a")];
    const result = findReadySteps(steps, new Set(), new Set(["a"]));
    expect(result.ready).toEqual([]);
    expect(result.deadlocked).toEqual([]);
  });
});

describe("validateDependencies", () => {
  test("valid plan with no deps", () => {
    const result = validateDependencies([step("a"), step("b")]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("valid plan with deps", () => {
    const result = validateDependencies([step("a"), step("b", ["a"])]);
    expect(result.valid).toBe(true);
  });

  test("detects unknown dependency", () => {
    const result = validateDependencies([step("a", ["missing"])]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("missing");
  });

  test("detects self-dependency", () => {
    const result = validateDependencies([step("a", ["a"])]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("itself");
  });

  test("detects duplicate step IDs", () => {
    const result = validateDependencies([step("a"), step("a")]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Duplicate");
  });
});

describe("detectCycles", () => {
  test("no cycles in linear chain", () => {
    const cycles = detectCycles([step("a"), step("b", ["a"]), step("c", ["b"])]);
    expect(cycles).toEqual([]);
  });

  test("no cycles with independent steps", () => {
    const cycles = detectCycles([step("a"), step("b"), step("c")]);
    expect(cycles).toEqual([]);
  });

  test("detects simple two-node cycle", () => {
    const cycles = detectCycles([step("a", ["b"]), step("b", ["a"])]);
    expect(cycles.length).toBeGreaterThan(0);
  });

  test("detects three-node cycle", () => {
    const cycles = detectCycles([step("a", ["c"]), step("b", ["a"]), step("c", ["b"])]);
    expect(cycles.length).toBeGreaterThan(0);
  });

  test("no false positives with diamond dependency", () => {
    const steps = [
      step("a"),
      step("b", ["a"]),
      step("c", ["a"]),
      step("d", ["b", "c"]),
    ];
    const cycles = detectCycles(steps);
    expect(cycles).toEqual([]);
  });
});

describe("topologicalOrder", () => {
  test("single step", () => {
    const order = topologicalOrder([step("a")]);
    expect(order).toEqual(["a"]);
  });

  test("linear chain", () => {
    const order = topologicalOrder([step("a"), step("b", ["a"]), step("c", ["b"])]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  test("independent steps all appear", () => {
    const order = topologicalOrder([step("a"), step("b"), step("c")]);
    expect(order).toHaveLength(3);
    expect(new Set(order)).toEqual(new Set(["a", "b", "c"]));
  });

  test("respects dependency ordering", () => {
    const steps = [
      step("d", ["b", "c"]),
      step("a"),
      step("b", ["a"]),
      step("c", ["a"]),
    ];
    const order = topologicalOrder(steps)!;
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("c"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("d"));
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("d"));
  });

  test("returns null for cyclic graph", () => {
    const order = topologicalOrder([step("a", ["b"]), step("b", ["a"])]);
    expect(order).toBeNull();
  });
});
