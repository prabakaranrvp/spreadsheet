import type { CellId } from './types';
import { COLS, ROWS } from '../ui/grid.config';

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

/** Expand a rectangular range (e.g. A1:C3) into a flat list of cell IDs. */
export function expandRange(from: CellId, to: CellId): CellId[] {
  const { col: fc, row: fr } = parseCellId(from);
  const { col: tc, row: tr } = parseCellId(to);
  const minC = Math.min(fc, tc);
  const maxC = Math.max(fc, tc);
  const minR = Math.min(fr, tr);
  const maxR = Math.max(fr, tr);
  const ids: CellId[] = [];
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      ids.push(toCellId(c, r));
    }
  }
  return ids;
}
