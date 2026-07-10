import type { CellId } from './types';
import { COLS, ROWS } from '../ui/grid.config';

export interface CellRangeBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

export function colLetter(col: number): string {
  return String.fromCharCode(65 + col);
}

export function letterToIndex(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 65;
}

export function toCellId(col: number, row: number): CellId {
  return `${colLetter(col)}${row + 1}`;
}

export function parseCellId(id: CellId): { col: number; row: number } {
  const match = id.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return { col: 0, row: 0 };
  const letters = match[1].toUpperCase();
  // Multi-letter columns (AA, ZZ, …) are beyond the supported A–Z range.
  // Map them to COLS so inBounds() correctly returns false.
  const col = letters.length === 1 ? letterToIndex(letters) : COLS;
  return {
    col,
    row: parseInt(match[2], 10) - 1,
  };
}

export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

export function getRangeBounds(from: CellId, to: CellId): CellRangeBounds {
  const { col: fc, row: fr } = parseCellId(from);
  const { col: tc, row: tr } = parseCellId(to);
  return {
    minCol: Math.min(fc, tc),
    maxCol: Math.max(fc, tc),
    minRow: Math.min(fr, tr),
    maxRow: Math.max(fr, tr),
  };
}

export function getRangeReference(from: CellId, to: CellId): string {
  const bounds = getRangeBounds(from, to);
  const start = toCellId(bounds.minCol, bounds.minRow);
  const end = toCellId(bounds.maxCol, bounds.maxRow);
  return start === end ? start : `${start}:${end}`;
}

export function isCellInRange(id: CellId, from: CellId, to: CellId): boolean {
  const { col, row } = parseCellId(id);
  const bounds = getRangeBounds(from, to);
  return (
    col >= bounds.minCol &&
    col <= bounds.maxCol &&
    row >= bounds.minRow &&
    row <= bounds.maxRow
  );
}

/** Expand a rectangular range (e.g. A1:C3) into a flat list of cell IDs. */
export function expandRange(from: CellId, to: CellId): CellId[] {
  const { minCol, maxCol, minRow, maxRow } = getRangeBounds(from, to);
  const ids: CellId[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      ids.push(toCellId(c, r));
    }
  }
  return ids;
}
