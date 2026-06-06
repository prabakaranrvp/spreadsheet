import type { Cell, CellId, CellError } from './types';
import { createEmptyCell } from './CellStore';
import { parseFormula, extractDeps } from './FormulaParser';
import { evaluate, isCellError } from './FormulaEvaluator';
import {
  createGraph,
  updateDeps,
  hasCycle,
  getAffected,
  getRecalcOrder,
  type DependencyGraph,
} from './DependencyGraph';

// ---------------------------------------------------------------------------
// Serialisation types (public)
// ---------------------------------------------------------------------------

export interface SerializedSheet {
  cells: Array<{ id: CellId; raw: string }>;
}

export interface RecalcResult {
  affected: CellId[];
}

// ---------------------------------------------------------------------------
// Error display glyphs (UI-facing strings kept here so store/UI stay clean)
// ---------------------------------------------------------------------------

const ERROR_DISPLAY: Record<CellError, string> = {
  CIRCULAR_REF: '#CIRCULAR_REF',
  DIV_ZERO:     '#DIV/0!',
  INVALID_REF:  '#REF!',
  PARSE_ERROR:  '#ERROR!',
  NAME_ERROR:   '#NAME?',
};

// ---------------------------------------------------------------------------
// SpreadsheetEngine
// ---------------------------------------------------------------------------

export class SpreadsheetEngine {
  private cells: Map<CellId, Cell> = new Map();
  private graph: DependencyGraph = createGraph();

  // ---------- private helpers ----------

  /** Read a cell's computed value for use as a formula dependency. */
  private getVal(id: CellId): string | number | null {
    const cell = this.cells.get(id);
    if (!cell || cell.error) return null;
    return cell.computed;
  }

  /** Evaluate raw input for a single cell and return the resulting Cell object. */
  private evalCell(id: CellId, raw: string): Cell {
    if (raw === '') {
      return createEmptyCell();
    }

    if (!raw.startsWith('=')) {
      const num = Number(raw);
      if (raw.trim() !== '' && !Number.isNaN(num)) {
        return { raw, computed: num, type: 'number' };
      }
      return { raw, computed: raw, type: 'text' };
    }

    // Formula path
    const ast = parseFormula(raw);

    if (ast.kind === 'Error') {
      return { raw, computed: ERROR_DISPLAY[ast.error], type: 'formula', error: ast.error };
    }

    const result = evaluate(ast, (refId) => this.getVal(refId));

    if (isCellError(result)) {
      return { raw, computed: ERROR_DISPLAY[result], type: 'formula', error: result };
    }

    return { raw, computed: result as string | number | null, type: 'formula' };
  }

  /** Mark every cell in `ids` with CIRCULAR_REF. */
  private markCycleError(ids: CellId[]): void {
    for (const id of ids) {
      const raw = this.cells.get(id)?.raw ?? '';
      this.cells.set(id, {
        raw,
        computed: ERROR_DISPLAY.CIRCULAR_REF,
        type: 'formula',
        error: 'CIRCULAR_REF',
      });
    }
  }

  // ---------- public API ----------

  /**
   * Set the raw input for a cell, update the dependency graph, recalculate
   * all transitive dependents, and return the list of affected cell IDs so
   * the store can bump version counters for targeted re-renders.
   */
  setCellRaw(id: CellId, raw: string): RecalcResult {
    const isFormula = raw.startsWith('=');
    const ast = isFormula ? parseFormula(raw) : null;
    const newDeps =
      ast && ast.kind !== 'Error' ? extractDeps(ast) : new Set<CellId>();

    updateDeps(this.graph, id, newDeps);

    // Cycle check — must happen after the graph is updated
    if (isFormula && hasCycle(this.graph, id)) {
      const affected = getAffected(this.graph, id);
      this.markCycleError(affected);
      return { affected };
    }

    // Topo-sorted recalculation
    const order = getRecalcOrder(this.graph, id);

    for (const cellId of order) {
      const cellRaw = cellId === id ? raw : (this.cells.get(cellId)?.raw ?? '');
      const cell = this.evalCell(cellId, cellRaw);
      if (cell.type === 'empty') {
        this.cells.delete(cellId);
      } else {
        this.cells.set(cellId, cell);
      }
    }

    return { affected: order };
  }

  /** Read the current state of a cell (O(1)). Returns an empty cell for absent IDs. */
  getCell(id: CellId): Cell {
    return this.cells.get(id) ?? createEmptyCell();
  }

  /**
   * Snapshot: only raw values are serialised.
   * Computed values are derived on restore (data_layer §8).
   */
  snapshot(): SerializedSheet {
    return {
      cells: [...this.cells.entries()]
        .filter(([, c]) => c.raw !== '')
        .map(([cellId, c]) => ({ id: cellId, raw: c.raw })),
    };
  }

  /**
   * Restore from a snapshot: clears current state and replays every raw
   * value through setCellRaw so computed values and the dep graph are rebuilt.
   */
  restore(snap: SerializedSheet): void {
    this.cells.clear();
    this.graph = createGraph();
    for (const { id, raw } of snap.cells) {
      this.setCellRaw(id, raw);
    }
  }
}
