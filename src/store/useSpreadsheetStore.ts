import { create } from 'zustand';
import type { Cell, CellId, Direction } from '../engine/types';
import { parseCellId, inBounds } from '../engine/RangeUtils';
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

interface SpreadsheetState {
  /** The single stable engine instance — never replaced. */
  engine: SpreadsheetEngine;
  /** Per-cell re-render signal; bumped for each affected cell on commit. */
  versions: Map<CellId, number>;

  selectedCell: CellId;
  editingCell: CellId | null;
  editSource: EditSource | null;
  editBuffer: string;

  getCell: (id: CellId) => Cell;
  selectCell: (id: CellId) => void;
  enterEditMode: (id: CellId, seed?: string, source?: EditSource) => void;
  setEditSource: (source: EditSource) => void;
  updateBuffer: (value: string) => void;
  commitEdit: (opts?: { then?: Direction }) => void;
  discardEdit: () => void;
  navigate: (dir: Direction) => void;
  clearCell: (id: CellId) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSpreadsheetStore = create<SpreadsheetState>((set, get) => ({
  engine,
  versions: new Map(),
  selectedCell: 'A1',
  editingCell: null,
  editSource: null,
  editBuffer: '',

  /** Stable reference — reads live engine state on every call. */
  getCell: (id) => get().engine.getCell(id),

  selectCell: (id) => {
    const { editingCell, commitEdit } = get();
    // Commit any in-progress edit before moving selection (Sheets-like behaviour)
    if (editingCell && editingCell !== id) commitEdit();
    set({ selectedCell: id });
  },

  enterEditMode: (id, seed, source = 'cell') => {
    const cell = get().engine.getCell(id);
    set({
      editingCell: id,
      selectedCell: id,
      editSource: source,
      editBuffer: seed ?? cell.raw,
    });
  },

  setEditSource: (source) => {
    if (get().editingCell) set({ editSource: source });
  },

  updateBuffer: (value) => set({ editBuffer: value }),

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
        versions: bumpVersions(versions, affected),
        selectedCell: nextSelected,
      });
      scheduleSave(eng.snapshot());
    } else {
      set({
        editingCell: null,
        editSource: null,
        editBuffer: '',
        selectedCell: nextSelected,
      });
    }
  },

  discardEdit: () =>
    set({ editingCell: null, editSource: null, editBuffer: '' }),

  navigate: (dir) => {
    const next = navigateFrom(get().selectedCell, dir);
    set({ selectedCell: next });
  },

  clearCell: (id) => {
    const { engine: eng, versions } = get();
    const existingRaw = eng.getCell(id).raw;
    if (existingRaw === '') return; // already empty, skip write
    const { affected } = eng.setCellRaw(id, '');
    set({ versions: bumpVersions(versions, affected) });
    scheduleSave(eng.snapshot());
  },
}));
