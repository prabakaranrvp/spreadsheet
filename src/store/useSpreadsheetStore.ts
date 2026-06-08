import { create } from 'zustand';
import type { Cell, CellId, Direction } from '../engine/types';
import {
  getRangeBounds,
  getRangeReference,
  inBounds,
  parseCellId,
  toCellId,
} from '../engine/RangeUtils';
import { COLS, ROWS } from '../ui/grid.config';
import { SpreadsheetEngine } from '../engine/SpreadsheetEngine';
import { loadSnapshot, scheduleSave } from './persistence';

// ---------------------------------------------------------------------------
// Helpers (pure, no store access)
// ---------------------------------------------------------------------------

function bumpVersions(
  versions: Map<CellId, number>,
  affected: CellId[],
): Map<CellId, number> {
  const next = new Map(versions);
  for (const id of affected) {
    next.set(id, (next.get(id) ?? 0) + 1);
  }
  return next;
}

function colLetter(col: number): string {
  return String.fromCharCode(65 + col);
}

function navigateFrom(id: CellId, dir: Direction): CellId {
  const { col, row } = parseCellId(id);
  let nextCol = col;
  let nextRow = row;

  switch (dir) {
    case 'up':       nextRow = Math.max(0, row - 1); break;
    case 'down':     nextRow = Math.min(ROWS - 1, row + 1); break;
    case 'left':
    case 'shiftTab': nextCol = Math.max(0, col - 1); break;
    case 'right':
    case 'tab':      nextCol = Math.min(COLS - 1, col + 1); break;
    default:         break;
  }

  if (!inBounds(nextCol, nextRow)) return id;
  return `${colLetter(nextCol)}${nextRow + 1}`;
}

function cellToClipboardValue(cell: Cell): string {
  return cell.computed == null ? '' : String(cell.computed);
}

function buildClipboardText(
  eng: SpreadsheetEngine,
  anchor: CellId,
  focus: CellId,
): string {
  const { minCol, maxCol, minRow, maxRow } = getRangeBounds(anchor, focus);
  const rows: string[] = [];

  for (let row = minRow; row <= maxRow; row++) {
    const values: string[] = [];
    for (let col = minCol; col <= maxCol; col++) {
      values.push(cellToClipboardValue(eng.getCell(toCellId(col, row))));
    }
    rows.push(values.join('\t'));
  }

  return rows.join('\n');
}

function replaceRange(
  value: string,
  start: number,
  end: number,
  replacement: string,
): string {
  return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
}

function clampCursor(value: string, cursor: number | null): number {
  if (cursor == null) return value.length;
  return Math.max(0, Math.min(value.length, cursor));
}

function isEditingFormula(state: SpreadsheetState): boolean {
  return state.editingCell != null && state.editBuffer.startsWith('=');
}

// ---------------------------------------------------------------------------
// Hydrate engine from localStorage once at module load time
// ---------------------------------------------------------------------------

const engine = new SpreadsheetEngine();
const savedSheet = loadSnapshot();
if (savedSheet) engine.restore(savedSheet);

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export type EditSource = 'cell' | 'formulaBar';

export interface SelectionRange {
  anchor: CellId;
  focus: CellId;
}

interface FormulaReferenceSpan {
  start: number;
  end: number;
}

interface SpreadsheetState {
  /** The single stable engine instance — never replaced. */
  engine: SpreadsheetEngine;
  /** Per-cell re-render signal; bumped for each affected cell on commit. */
  versions: Map<CellId, number>;

  selectedCell: CellId;
  selectionAnchor: CellId;
  selectionFocus: CellId;
  editingCell: CellId | null;
  editSource: EditSource | null;
  editBuffer: string;
  editCursor: number | null;
  formulaReferenceSpan: FormulaReferenceSpan | null;

  getCell: (id: CellId) => Cell;
  selectCell: (id: CellId, opts?: { extend?: boolean }) => void;
  extendSelection: (id: CellId) => void;
  getSelectedRange: () => SelectionRange;
  getSelectedRangeReference: () => string;
  getSelectionClipboardText: () => string;
  enterEditMode: (id: CellId, seed?: string, source?: EditSource) => void;
  setEditSource: (source: EditSource) => void;
  updateBuffer: (value: string, cursor?: number | null) => void;
  setEditCursor: (cursor: number | null) => void;
  commitEdit: (opts?: { then?: Direction }) => void;
  discardEdit: () => void;
  navigate: (dir: Direction, opts?: { extend?: boolean }) => void;
  clearCell: (id: CellId) => void;
  clearSelection: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSpreadsheetStore = create<SpreadsheetState>((set, get) => ({
  engine,
  versions: new Map(),
  selectedCell: 'A1',
  selectionAnchor: 'A1',
  selectionFocus: 'A1',
  editingCell: null,
  editSource: null,
  editBuffer: '',
  editCursor: null,
  formulaReferenceSpan: null,

  /** Stable reference — reads live engine state on every call. */
  getCell: (id) => get().engine.getCell(id),

  selectCell: (id, opts) => {
    const state = get();
    const { editingCell, commitEdit } = state;

    if (isEditingFormula(state) && editingCell !== id) {
      const anchor = opts?.extend ? state.selectionAnchor : id;
      const reference = getRangeReference(anchor, id);
      const span = state.formulaReferenceSpan ?? {
        start: clampCursor(state.editBuffer, state.editCursor),
        end: clampCursor(state.editBuffer, state.editCursor),
      };
      const nextBuffer = replaceRange(
        state.editBuffer,
        span.start,
        span.end,
        reference,
      );
      const nextEnd = span.start + reference.length;
      set({
        selectedCell: id,
        selectionAnchor: anchor,
        selectionFocus: id,
        editBuffer: nextBuffer,
        editCursor: nextEnd,
        formulaReferenceSpan: { start: span.start, end: nextEnd },
      });
      return;
    }

    // Commit any in-progress edit before moving selection (Sheets-like behaviour)
    if (editingCell && editingCell !== id) commitEdit();
    set({
      selectedCell: id,
      selectionAnchor: opts?.extend ? state.selectionAnchor : id,
      selectionFocus: id,
      formulaReferenceSpan: null,
    });
  },

  extendSelection: (id) => {
    const state = get();
    get().selectCell(id, { extend: state.selectionAnchor !== id });
  },

  getSelectedRange: () => {
    const { selectionAnchor, selectionFocus } = get();
    return { anchor: selectionAnchor, focus: selectionFocus };
  },

  getSelectedRangeReference: () => {
    const { selectionAnchor, selectionFocus } = get();
    return getRangeReference(selectionAnchor, selectionFocus);
  },

  getSelectionClipboardText: () => {
    const { engine: eng, selectionAnchor, selectionFocus } = get();
    return buildClipboardText(eng, selectionAnchor, selectionFocus);
  },

  enterEditMode: (id, seed, source = 'cell') => {
    const cell = get().engine.getCell(id);
    const editBuffer = seed ?? cell.raw;
    set({
      editingCell: id,
      selectedCell: id,
      selectionAnchor: id,
      selectionFocus: id,
      editSource: source,
      editBuffer,
      editCursor: editBuffer.length,
      formulaReferenceSpan: null,
    });
  },

  setEditSource: (source) => {
    if (get().editingCell) set({ editSource: source });
  },

  updateBuffer: (value, cursor) =>
    set({
      editBuffer: value,
      editCursor: cursor ?? value.length,
      formulaReferenceSpan: null,
    }),

  setEditCursor: (cursor) => set({ editCursor: cursor }),

  commitEdit: (opts) => {
    const { editingCell, editBuffer, engine: eng, versions } = get();

    if (!editingCell) {
      if (opts?.then) get().navigate(opts.then);
      return;
    }

    const existingRaw = eng.getCell(editingCell).raw;
    const raw = editBuffer;

    // Always clear edit state first so the input unmounts cleanly
    const nextSelected = opts?.then
      ? navigateFrom(editingCell, opts.then)
      : editingCell;

    if (raw !== existingRaw) {
      // The only place that writes to the engine
      const { affected } = eng.setCellRaw(editingCell, raw);
      set({
        editingCell: null,
        editSource: null,
        editBuffer: '',
        editCursor: null,
        formulaReferenceSpan: null,
        versions: bumpVersions(versions, affected),
        selectedCell: nextSelected,
        selectionAnchor: nextSelected,
        selectionFocus: nextSelected,
      });
      scheduleSave(eng.snapshot());
    } else {
      set({
        editingCell: null,
        editSource: null,
        editBuffer: '',
        editCursor: null,
        formulaReferenceSpan: null,
        selectedCell: nextSelected,
        selectionAnchor: nextSelected,
        selectionFocus: nextSelected,
      });
    }
  },

  discardEdit: () =>
    set({
      editingCell: null,
      editSource: null,
      editBuffer: '',
      editCursor: null,
      formulaReferenceSpan: null,
    }),

  navigate: (dir, opts) => {
    const next = navigateFrom(get().selectedCell, dir);
    const state = get();
    set({
      selectedCell: next,
      selectionAnchor: opts?.extend ? state.selectionAnchor : next,
      selectionFocus: next,
      formulaReferenceSpan: null,
    });
  },

  clearCell: (id) => {
    const { engine: eng, versions } = get();
    const existingRaw = eng.getCell(id).raw;
    if (existingRaw === '') return; // already empty, skip write
    const { affected } = eng.setCellRaw(id, '');
    set({ versions: bumpVersions(versions, affected) });
    scheduleSave(eng.snapshot());
  },

  clearSelection: () => {
    const { engine: eng, versions, selectionAnchor, selectionFocus } = get();
    const { minCol, maxCol, minRow, maxRow } = getRangeBounds(
      selectionAnchor,
      selectionFocus,
    );
    let nextVersions = versions;
    let didMutate = false;

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const id = toCellId(col, row);
        if (eng.getCell(id).raw === '') continue;
        const { affected } = eng.setCellRaw(id, '');
        nextVersions = bumpVersions(nextVersions, affected);
        didMutate = true;
      }
    }

    if (!didMutate) return;
    set({ versions: nextVersions });
    scheduleSave(eng.snapshot());
  },
}));
