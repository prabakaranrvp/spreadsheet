import { parseFormula, extractDeps } from './FormulaParser';

// ---------------------------------------------------------------------------
// parseFormula
// ---------------------------------------------------------------------------

describe('parseFormula', () => {
  describe('non-formula input', () => {
    it('returns PARSE_ERROR when string does not start with "="', () => {
      expect(parseFormula('hello')).toEqual({ kind: 'Error', error: 'PARSE_ERROR' });
    });

    it('returns PARSE_ERROR for just "="', () => {
      expect(parseFormula('=')).toEqual({ kind: 'Error', error: 'PARSE_ERROR' });
    });

    it('returns PARSE_ERROR for "= " (whitespace only after =)', () => {
      expect(parseFormula('= ')).toEqual({ kind: 'Error', error: 'PARSE_ERROR' });
    });
  });

  describe('literals', () => {
    it('parses an integer literal', () => {
      expect(parseFormula('=42')).toEqual({ kind: 'Number', value: 42 });
    });

    it('parses a decimal literal', () => {
      expect(parseFormula('=3.14')).toEqual({ kind: 'Number', value: 3.14 });
    });

    it('parses zero', () => {
      expect(parseFormula('=0')).toEqual({ kind: 'Number', value: 0 });
    });
  });

  describe('cell references', () => {
    it('parses a simple cell reference', () => {
      expect(parseFormula('=A1')).toEqual({ kind: 'CellRef', id: 'A1' });
    });

    it('parses a cell reference with multi-digit row', () => {
      expect(parseFormula('=B10')).toEqual({ kind: 'CellRef', id: 'B10' });
    });

    it('parses a cell reference in lowercase (uppercased during tokenization)', () => {
      expect(parseFormula('=a1')).toEqual({ kind: 'CellRef', id: 'A1' });
    });
  });

  describe('arithmetic operators', () => {
    it('parses addition', () => {
      expect(parseFormula('=1+2')).toMatchObject({
        kind: 'BinOp',
        op: '+',
        left: { kind: 'Number', value: 1 },
        right: { kind: 'Number', value: 2 },
      });
    });

    it('parses subtraction', () => {
      expect(parseFormula('=5-3')).toMatchObject({ kind: 'BinOp', op: '-' });
    });

    it('parses multiplication', () => {
      expect(parseFormula('=2*3')).toMatchObject({ kind: 'BinOp', op: '*' });
    });

    it('parses division', () => {
      expect(parseFormula('=10/2')).toMatchObject({ kind: 'BinOp', op: '/' });
    });

    it('respects operator precedence: * binds tighter than +', () => {
      const node = parseFormula('=2+3*4');
      // Should produce 2 + (3*4) — not (2+3)*4
      expect(node).toMatchObject({
        kind: 'BinOp',
        op: '+',
        left: { kind: 'Number', value: 2 },
        right: {
          kind: 'BinOp',
          op: '*',
          left: { kind: 'Number', value: 3 },
          right: { kind: 'Number', value: 4 },
        },
      });
    });

    it('respects operator precedence: / binds tighter than -', () => {
      const node = parseFormula('=10-4/2');
      expect(node).toMatchObject({
        kind: 'BinOp',
        op: '-',
        left: { kind: 'Number', value: 10 },
        right: { kind: 'BinOp', op: '/' },
      });
    });
  });

  describe('unary minus', () => {
    it('parses unary minus as (0 - factor)', () => {
      expect(parseFormula('=-5')).toMatchObject({
        kind: 'BinOp',
        op: '-',
        left: { kind: 'Number', value: 0 },
        right: { kind: 'Number', value: 5 },
      });
    });

    it('parses unary minus applied to a cell ref', () => {
      expect(parseFormula('=-A1')).toMatchObject({
        kind: 'BinOp',
        op: '-',
        left: { kind: 'Number', value: 0 },
        right: { kind: 'CellRef', id: 'A1' },
      });
    });
  });

  describe('parenthesised expressions', () => {
    it('parses a parenthesised sum', () => {
      expect(parseFormula('=(1+2)')).toMatchObject({
        kind: 'BinOp',
        op: '+',
      });
    });

    it('overrides precedence with parentheses', () => {
      const node = parseFormula('=(2+3)*4');
      expect(node).toMatchObject({
        kind: 'BinOp',
        op: '*',
        left: { kind: 'BinOp', op: '+' },
        right: { kind: 'Number', value: 4 },
      });
    });

    it('returns PARSE_ERROR for unclosed parenthesis', () => {
      expect(parseFormula('=(1+2')).toMatchObject({ kind: 'Error', error: 'PARSE_ERROR' });
    });
  });

  describe('range functions', () => {
    it('parses SUM', () => {
      expect(parseFormula('=SUM(A1:C3)')).toEqual({
        kind: 'RangeFunc',
        name: 'SUM',
        from: 'A1',
        to: 'C3',
      });
    });

    it('parses AVERAGE', () => {
      expect(parseFormula('=AVERAGE(B2:B5)')).toEqual({
        kind: 'RangeFunc',
        name: 'AVERAGE',
        from: 'B2',
        to: 'B5',
      });
    });

    it('parses SUM in lowercase (case-insensitive)', () => {
      expect(parseFormula('=sum(A1:B2)')).toEqual({
        kind: 'RangeFunc',
        name: 'SUM',
        from: 'A1',
        to: 'B2',
      });
    });

    it('returns NAME_ERROR for unknown function', () => {
      expect(parseFormula('=FOO(A1:B2)')).toEqual({ kind: 'Error', error: 'NAME_ERROR' });
    });

    it('returns PARSE_ERROR for SUM without a colon', () => {
      expect(parseFormula('=SUM(A1 B2)')).toMatchObject({ kind: 'Error', error: 'PARSE_ERROR' });
    });

    it('returns PARSE_ERROR for SUM with no closing paren', () => {
      expect(parseFormula('=SUM(A1:B2')).toMatchObject({ kind: 'Error', error: 'PARSE_ERROR' });
    });

    it('returns PARSE_ERROR for SUM with no opening paren', () => {
      expect(parseFormula('=SUM A1:B2)')).toMatchObject({ kind: 'Error', error: 'PARSE_ERROR' });
    });
  });

  describe('cell reference in arithmetic', () => {
    it('parses A1+B2', () => {
      expect(parseFormula('=A1+B2')).toMatchObject({
        kind: 'BinOp',
        op: '+',
        left: { kind: 'CellRef', id: 'A1' },
        right: { kind: 'CellRef', id: 'B2' },
      });
    });
  });

  describe('trailing tokens', () => {
    it('returns PARSE_ERROR when extra tokens follow a complete expression', () => {
      expect(parseFormula('=1+2 3')).toMatchObject({ kind: 'Error', error: 'PARSE_ERROR' });
    });
  });
});

// ---------------------------------------------------------------------------
// extractDeps
// ---------------------------------------------------------------------------

describe('extractDeps', () => {
  it('returns empty set for a Number node', () => {
    expect(extractDeps({ kind: 'Number', value: 42 }).size).toBe(0);
  });

  it('returns empty set for a Text node', () => {
    expect(extractDeps({ kind: 'Text', value: 'hi' }).size).toBe(0);
  });

  it('returns empty set for an Error node', () => {
    expect(extractDeps({ kind: 'Error', error: 'PARSE_ERROR' }).size).toBe(0);
  });

  it('returns the cell id for a CellRef node', () => {
    const ast = parseFormula('=A1');
    expect(extractDeps(ast)).toEqual(new Set(['A1']));
  });

  it('collects all cell refs from a BinOp tree', () => {
    const ast = parseFormula('=A1+B2');
    expect(extractDeps(ast)).toEqual(new Set(['A1', 'B2']));
  });

  it('collects all cells in a SUM range', () => {
    const ast = parseFormula('=SUM(A1:A3)');
    expect(extractDeps(ast)).toEqual(new Set(['A1', 'A2', 'A3']));
  });

  it('collects all cells in an AVERAGE range', () => {
    const ast = parseFormula('=AVERAGE(B1:B3)');
    expect(extractDeps(ast)).toEqual(new Set(['B1', 'B2', 'B3']));
  });

  it('excludes out-of-bounds references (multi-letter column)', () => {
    // AA1 has col = COLS which is out of bounds
    const ast = { kind: 'CellRef' as const, id: 'AA1' };
    expect(extractDeps(ast).size).toBe(0);
  });

  it('deduplicates the same cell referenced multiple times', () => {
    // =A1+A1 should still produce a single entry
    const ast = parseFormula('=A1+A1');
    expect(extractDeps(ast)).toEqual(new Set(['A1']));
  });

  it('collects deps from nested BinOp expressions', () => {
    const ast = parseFormula('=A1*B2+C3');
    expect(extractDeps(ast)).toEqual(new Set(['A1', 'B2', 'C3']));
  });
});
