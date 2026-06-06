import type { Cell, CellType } from './types';

export const EMPTY_CELL: Readonly<Cell> = Object.freeze({
  raw: '',
  computed: null,
  type: 'empty' as CellType,
});

export function createEmptyCell(): Cell {
  return { raw: '', computed: null, type: 'empty' };
}

/** Classify a raw string without evaluating formulas. */
export function classifyRaw(raw: string): CellType {
  if (raw === '') return 'empty';
  if (raw.startsWith('=')) return 'formula';
  if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return 'number';
  return 'text';
}
