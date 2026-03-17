import type { PlanStep } from "../types.ts";

export interface ReadyResult {
  ready: string[];
  deadlocked: string[];
}

export function findReadySteps(
  steps: PlanStep[],
  pending: Set<string>,
  completed: Set<string>,
): ReadyResult {
  const ready: string[] = [];

  for (const id of pending) {
    const step = steps.find((s) => s.id === id);
    if (!step) continue;
    const deps = step.depends_on ?? [];
    if (deps.every((d) => completed.has(d))) {
      ready.push(id);
    }
  }

  if (ready.length === 0 && pending.size > 0) {
    return { ready: [], deadlocked: [...pending] };
  }

  return { ready, deadlocked: [] };
}

export function validateDependencies(steps: PlanStep[]): { valid: boolean; errors: string[] } {
  const ids = new Set(steps.map((s) => s.id));
  const errors: string[] = [];

  const dupes = steps.map((s) => s.id).filter((id, i, arr) => arr.indexOf(id) !== i);
  if (dupes.length > 0) {
    errors.push(`Duplicate step IDs: ${[...new Set(dupes)].join(", ")}`);
  }

  for (const step of steps) {
    for (const dep of step.depends_on ?? []) {
      if (!ids.has(dep)) {
        errors.push(`Step "${step.id}" depends on unknown step "${dep}"`);
      }
      if (dep === step.id) {
        errors.push(`Step "${step.id}" depends on itself`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function detectCycles(steps: PlanStep[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const step of steps) {
    adj.set(step.id, step.depends_on ?? []);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string) {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart).concat(node));
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const dep of adj.get(node) ?? []) {
      dfs(dep);
    }

    path.pop();
    inStack.delete(node);
  }

  for (const step of steps) {
    dfs(step.id);
  }

  return cycles;
}

export function topologicalOrder(steps: PlanStep[]): string[] | null {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const step of steps) {
    adj.set(step.id, []);
    inDegree.set(step.id, 0);
  }

  for (const step of steps) {
    for (const dep of step.depends_on ?? []) {
      adj.get(dep)?.push(step.id);
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return order.length === steps.length ? order : null;
}
