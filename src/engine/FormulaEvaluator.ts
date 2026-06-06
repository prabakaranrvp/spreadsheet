import type { CellId, CellError } from './types';
import { expandRange, inBounds, parseCellId } from './RangeUtils';
import type { ASTNode } from './FormulaParser';

export type CellValue = string | number | null;
export type EvalResult = CellValue | CellError;

/** True when the result is one of the engine's error codes. */
const KNOWN_ERRORS = new Set<string>([
  'CIRCULAR_REF',
  'DIV_ZERO',
  'INVALID_REF',
  'PARSE_ERROR',
  'NAME_ERROR',
]);
export function isCellError(v: unknown): v is CellError {
  return typeof v === 'string' && KNOWN_ERRORS.has(v);
}

/**
 * Evaluate an AST node.
 *
 * @param node    - the parsed formula AST
 * @param getVal  - callback that returns the computed value (or null) for a
 *                  cell ID; supplied by the engine — keeps evaluator store-free.
 */
export function evaluate(
  node: ASTNode,
  getVal: (id: CellId) => CellValue,
): EvalResult {
  switch (node.kind) {
    case 'Number':
      return node.value;

    case 'Text':
      return node.value;

    case 'Error':
      return node.error;

    case 'CellRef': {
      const { col, row } = parseCellId(node.id);
      if (!inBounds(col, row)) return 'INVALID_REF';
      const v = getVal(node.id);
      // Empty cell used in arithmetic counts as 0 (§A3)
      return v === null ? 0 : v;
    }

    case 'BinOp': {
      const l = evaluate(node.left, getVal);
      const r = evaluate(node.right, getVal);
      // Propagate errors from sub-expressions
      if (isCellError(l)) return l;
      if (isCellError(r)) return r;
      if (typeof l !== 'number' || typeof r !== 'number') return 'PARSE_ERROR';
      if (node.op === '/' && r === 0) return 'DIV_ZERO';
      if (node.op === '+') return l + r;
      if (node.op === '-') return l - r;
      if (node.op === '*') return l * r;
      return l / r; // '/'
    }

    case 'RangeFunc': {
      const cells = expandRange(node.from, node.to).filter((id) => {
        const { col, row } = parseCellId(id);
        return inBounds(col, row);
      });
      // Only include numeric values; skip empty/text cells (§9.2 "skipping empties")
      const vals = cells
        .map((id) => getVal(id))
        .filter((v): v is number => typeof v === 'number');

      if (node.name === 'SUM') {
        return vals.reduce((a, b) => a + b, 0);
      }
      // AVERAGE of all-empty range → 0 (§A2 decision)
      return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }
}
