import type { Cell, CellError } from '../engine/types';

export const ERROR_KEY: Record<CellError, string> = {
  CIRCULAR_REF: 'errors.circularRef',
  DIV_ZERO: 'errors.divZero',
  INVALID_REF: 'errors.invalidRef',
  PARSE_ERROR: 'errors.parseError',
  NAME_ERROR: 'errors.nameError',
};

export function displayValue(
  cell: Cell,
  t: (key: string) => string,
  nf: Intl.NumberFormat,
): string {
  if (cell.error) return t(ERROR_KEY[cell.error]);
  if (cell.computed == null || cell.computed === '') return '';
  if (typeof cell.computed === 'number') return nf.format(cell.computed);
  return String(cell.computed);
}

/** Tailwind classes for cell display — single source per LLD §10. */
export function cellClasses(cell: Cell): string {
  const base =
    'flex h-full w-full items-center truncate px-1 text-[13px] leading-cellh select-none';
  if (cell.error) {
    return `${base} justify-end bg-red-50 font-medium text-red-600`;
  }
  if (cell.type === 'number' || cell.type === 'formula') {
    return `${base} justify-end tabular-nums text-gray-900`;
  }
  return `${base} justify-start text-gray-900`;
}
