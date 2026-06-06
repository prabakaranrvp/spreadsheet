import { evaluate, isCellError } from './FormulaEvaluator';
import type { ASTNode } from './FormulaParser';
import type { CellValue } from './FormulaEvaluator';

const noVal = (): CellValue => null;

// ---------------------------------------------------------------------------
// isCellError
// ---------------------------------------------------------------------------

describe('isCellError', () => {
  it('returns true for CIRCULAR_REF', () => expect(isCellError('CIRCULAR_REF')).toBe(true));
  it('returns true for DIV_ZERO', () => expect(isCellError('DIV_ZERO')).toBe(true));
  it('returns true for INVALID_REF', () => expect(isCellError('INVALID_REF')).toBe(true));
  it('returns true for PARSE_ERROR', () => expect(isCellError('PARSE_ERROR')).toBe(true));
  it('returns true for NAME_ERROR', () => expect(isCellError('NAME_ERROR')).toBe(true));
  it('returns false for an arbitrary string', () => expect(isCellError('hello')).toBe(false));
  it('returns false for a number', () => expect(isCellError(42)).toBe(false));
  it('returns false for null', () => expect(isCellError(null)).toBe(false));
  it('returns false for undefined', () => expect(isCellError(undefined)).toBe(false));
});

// ---------------------------------------------------------------------------
// evaluate — leaf nodes
// ---------------------------------------------------------------------------

describe('evaluate — Number', () => {
  it('returns the numeric value', () => {
    const node: ASTNode = { kind: 'Number', value: 42 };
    expect(evaluate(node, noVal)).toBe(42);
  });

  it('returns zero for a zero literal', () => {
    const node: ASTNode = { kind: 'Number', value: 0 };
    expect(evaluate(node, noVal)).toBe(0);
  });
});

describe('evaluate — Text', () => {
  it('returns the string value', () => {
    const node: ASTNode = { kind: 'Text', value: 'hello' };
    expect(evaluate(node, noVal)).toBe('hello');
  });
});

describe('evaluate — Error', () => {
  it('propagates the error code', () => {
    const node: ASTNode = { kind: 'Error', error: 'PARSE_ERROR' };
    expect(evaluate(node, noVal)).toBe('PARSE_ERROR');
  });
});

// ---------------------------------------------------------------------------
// evaluate — CellRef
// ---------------------------------------------------------------------------

describe('evaluate — CellRef', () => {
  it('returns the cell value when available', () => {
    const node: ASTNode = { kind: 'CellRef', id: 'A1' };
    expect(evaluate(node, (id) => (id === 'A1' ? 5 : null))).toBe(5);
  });

  it('returns 0 for an empty cell (null → 0 in arithmetic)', () => {
    const node: ASTNode = { kind: 'CellRef', id: 'A1' };
    expect(evaluate(node, noVal)).toBe(0);
  });

  it('returns INVALID_REF for an out-of-bounds cell (multi-letter column)', () => {
    const node: ASTNode = { kind: 'CellRef', id: 'AA1' };
    expect(evaluate(node, noVal)).toBe('INVALID_REF');
  });

  it('returns a string value from a text cell', () => {
    const node: ASTNode = { kind: 'CellRef', id: 'B2' };
    expect(evaluate(node, (id) => (id === 'B2' ? 'text' : null))).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// evaluate — BinOp
// ---------------------------------------------------------------------------

describe('evaluate — BinOp arithmetic', () => {
  const num = (value: number): ASTNode => ({ kind: 'Number', value });

  it('adds two numbers', () => {
    expect(evaluate({ kind: 'BinOp', op: '+', left: num(3), right: num(4) }, noVal)).toBe(7);
  });

  it('subtracts two numbers', () => {
    expect(evaluate({ kind: 'BinOp', op: '-', left: num(10), right: num(3) }, noVal)).toBe(7);
  });

  it('multiplies two numbers', () => {
    expect(evaluate({ kind: 'BinOp', op: '*', left: num(3), right: num(4) }, noVal)).toBe(12);
  });

  it('divides two numbers', () => {
    expect(evaluate({ kind: 'BinOp', op: '/', left: num(12), right: num(4) }, noVal)).toBe(3);
  });

  it('returns DIV_ZERO on division by zero', () => {
    expect(
      evaluate({ kind: 'BinOp', op: '/', left: num(5), right: num(0) }, noVal),
    ).toBe('DIV_ZERO');
  });
});

describe('evaluate — BinOp error propagation', () => {
  const num = (value: number): ASTNode => ({ kind: 'Number', value });
  const err = (error: ASTNode['kind'] extends 'Error' ? never : Parameters<typeof isCellError>[0] extends string ? string : never): ASTNode =>
    ({ kind: 'Error', error: error as any });

  it('propagates error from the left operand', () => {
    expect(
      evaluate({ kind: 'BinOp', op: '+', left: { kind: 'Error', error: 'PARSE_ERROR' }, right: num(1) }, noVal),
    ).toBe('PARSE_ERROR');
  });

  it('propagates error from the right operand', () => {
    expect(
      evaluate({ kind: 'BinOp', op: '+', left: num(1), right: { kind: 'Error', error: 'NAME_ERROR' } }, noVal),
    ).toBe('NAME_ERROR');
  });

  it('returns PARSE_ERROR when left operand is text (not numeric)', () => {
    expect(
      evaluate({ kind: 'BinOp', op: '+', left: { kind: 'Text', value: 'a' }, right: num(1) }, noVal),
    ).toBe('PARSE_ERROR');
  });

  it('returns PARSE_ERROR when right operand is text (not numeric)', () => {
    expect(
      evaluate({ kind: 'BinOp', op: '*', left: num(2), right: { kind: 'Text', value: 'b' } }, noVal),
    ).toBe('PARSE_ERROR');
  });
});

// ---------------------------------------------------------------------------
// evaluate — RangeFunc (SUM)
// ---------------------------------------------------------------------------

describe('evaluate — SUM', () => {
  const makeSum = (from: string, to: string): ASTNode => ({
    kind: 'RangeFunc',
    name: 'SUM',
    from,
    to,
  });

  it('sums numeric values in a column range', () => {
    const getVal = (id: string): CellValue =>
      ({ A1: 1, A2: 2, A3: 3 }[id] ?? null);
    expect(evaluate(makeSum('A1', 'A3'), getVal)).toBe(6);
  });

  it('returns 0 for an all-empty range', () => {
    expect(evaluate(makeSum('A1', 'A3'), noVal)).toBe(0);
  });

  it('skips null (empty) cells', () => {
    const getVal = (id: string): CellValue =>
      id === 'A2' ? 5 : null;
    expect(evaluate(makeSum('A1', 'A3'), getVal)).toBe(5);
  });

  it('skips text values', () => {
    const getVal = (id: string): CellValue =>
      id === 'A1' ? 'text' : 4;
    expect(evaluate(makeSum('A1', 'A2'), getVal)).toBe(4);
  });

  it('returns 0 for SUM of a single-cell empty range', () => {
    expect(evaluate(makeSum('A1', 'A1'), noVal)).toBe(0);
  });

  it('sums a row range', () => {
    const getVal = (id: string): CellValue =>
      ({ A1: 10, B1: 20, C1: 30 }[id] ?? null);
    expect(evaluate(makeSum('A1', 'C1'), getVal)).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// evaluate — RangeFunc (AVERAGE)
// ---------------------------------------------------------------------------

describe('evaluate — AVERAGE', () => {
  const makeAvg = (from: string, to: string): ASTNode => ({
    kind: 'RangeFunc',
    name: 'AVERAGE',
    from,
    to,
  });

  it('averages numeric values', () => {
    const getVal = (id: string): CellValue =>
      ({ A1: 2, A2: 4, A3: 6 }[id] ?? null);
    expect(evaluate(makeAvg('A1', 'A3'), getVal)).toBe(4);
  });

  it('returns 0 for an all-empty range', () => {
    expect(evaluate(makeAvg('A1', 'A3'), noVal)).toBe(0);
  });

  it('skips null cells in the average', () => {
    const getVal = (id: string): CellValue =>
      id === 'A1' ? 10 : null;
    // Only one numeric cell → average of one value
    expect(evaluate(makeAvg('A1', 'A3'), getVal)).toBe(10);
  });

  it('skips text cells in the average', () => {
    const getVal = (id: string): CellValue =>
      id === 'A1' ? 'text' : 8;
    // A2 = 8, A1 = text (skipped) → average of [8] = 8
    expect(evaluate(makeAvg('A1', 'A2'), getVal)).toBe(8);
  });
});
