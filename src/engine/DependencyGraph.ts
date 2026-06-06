import type { CellId } from './types';

export interface DependencyGraph {
  /** forward[X] = set of cells X depends ON  (X reads these) */
  forward: Map<CellId, Set<CellId>>;
  /** reverse[X] = set of cells that depend ON X  (they read X) */
  reverse: Map<CellId, Set<CellId>>;
}

export function createGraph(): DependencyGraph {
  return { forward: new Map(), reverse: new Map() };
}

// ---------------------------------------------------------------------------
// Graph mutation
// ---------------------------------------------------------------------------

/**
 * Update the dependency graph when cell `id` adopts a new set of deps.
 * Cleans up stale reverse edges from the old dep set automatically.
 */
export function updateDeps(
  graph: DependencyGraph,
  id: CellId,
  newDeps: Set<CellId>,
): void {
  // 1. Remove old reverse edges
  const oldDeps = graph.forward.get(id) ?? new Set<CellId>();
  for (const dep of oldDeps) {
    graph.reverse.get(dep)?.delete(id);
  }

  // 2. Update (or clear) forward edges
  if (newDeps.size === 0) {
    graph.forward.delete(id);
  } else {
    graph.forward.set(id, newDeps);
  }

  // 3. Add new reverse edges
  for (const dep of newDeps) {
    if (!graph.reverse.has(dep)) graph.reverse.set(dep, new Set());
    graph.reverse.get(dep)!.add(id);
  }
}

// ---------------------------------------------------------------------------
// Cycle detection  (DFS over forward edges)
// ---------------------------------------------------------------------------

/**
 * Returns true if there is any cycle reachable from `startId` following
 * forward (dependency) edges.
 */
export function hasCycle(graph: DependencyGraph, startId: CellId): boolean {
  const visited = new Set<CellId>();
  const stack = new Set<CellId>();

  function dfs(id: CellId): boolean {
    if (stack.has(id)) return true;   // back edge → cycle
    if (visited.has(id)) return false;

    visited.add(id);
    stack.add(id);

    for (const dep of graph.forward.get(id) ?? []) {
      if (dfs(dep)) return true;
    }

    stack.delete(id);
    return false;
  }

  return dfs(startId);
}

// ---------------------------------------------------------------------------
// Affected-cell collection  (BFS over reverse edges)
// ---------------------------------------------------------------------------

/**
 * BFS over reverse edges from `changedId`.
 * Returns every cell that (transitively) depends on `changedId`, including
 * `changedId` itself, in BFS discovery order (not necessarily topo order).
 */
export function getAffected(graph: DependencyGraph, changedId: CellId): CellId[] {
  const affected: CellId[] = [];
  const visited = new Set<CellId>();
  const queue: CellId[] = [changedId];

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    affected.push(id);
    for (const dep of graph.reverse.get(id) ?? []) {
      queue.push(dep);
    }
  }

  return affected;
}

// ---------------------------------------------------------------------------
// Topological sort (Kahn's algorithm, restricted to affected set)
// ---------------------------------------------------------------------------

function topoSort(ids: CellId[], graph: DependencyGraph): CellId[] {
  const idSet = new Set(ids);

  // Compute in-degree within the affected subset
  const inDegree = new Map<CellId, number>();
  for (const id of ids) inDegree.set(id, 0);
  for (const id of ids) {
    for (const dep of graph.forward.get(id) ?? []) {
      if (idSet.has(dep)) {
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }
  }

  // Kahn's BFS: start from nodes with no incoming edges (in subset)
  const queue: CellId[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const result: CellId[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    result.push(id);
    for (const dep of graph.reverse.get(id) ?? []) {
      if (idSet.has(dep)) {
        const newDeg = (inDegree.get(dep) ?? 0) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) queue.push(dep);
      }
    }
  }

  // If result is shorter than ids, there's a cycle inside the subset.
  // Return whatever we have — the caller already handled the cycle via hasCycle.
  return result.length === ids.length ? result : ids;
}

/**
 * Returns the set of cells that must be recalculated after `changedId`
 * changes, in topological order (dependencies evaluated before dependents).
 */
export function getRecalcOrder(
  graph: DependencyGraph,
  changedId: CellId,
): CellId[] {
  return topoSort(getAffected(graph, changedId), graph);
}
