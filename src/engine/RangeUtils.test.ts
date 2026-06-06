import { colLetter, letterToIndex, toCellId, parseCellId, inBounds, expandRange } from './RangeUtils';
import { COLS, ROWS } from '../ui/grid.config';

describe('colLetter', () => {
  it('returns A for column 0', () => expect(colLetter(0)).toBe('A'));
  it('returns B for column 1', () => expect(colLetter(1)).toBe('B'));
  it('returns Z for column 25', () => expect(colLetter(25)).toBe('Z'));
});

describe('letterToIndex', () => {
  it('returns 0 for A', () => expect(letterToIndex('A')).toBe(0));
  it('returns 25 for Z', () => expect(letterToIndex('Z')).toBe(25));
  it('is case-insensitive', () => expect(letterToIndex('a')).toBe(0));
  it('handles mid-alphabet letters', () => expect(letterToIndex('M')).toBe(12));
});

describe('toCellId', () => {
  it('returns A1 for col=0, row=0', () => expect(toCellId(0, 0)).toBe('A1'));
  it('returns B3 for col=1, row=2', () => expect(toCellId(1, 2)).toBe('B3'));
  it('returns Z100 for last cell', () => expect(toCellId(25, 99)).toBe('Z100'));
  it('returns A2 for col=0, row=1', () => expect(toCellId(0, 1)).toBe('A2'));
});

describe('parseCellId', () => {
  it('parses A1 as col=0, row=0', () => {
    expect(parseCellId('A1')).toEqual({ col: 0, row: 0 });
  });
  it('parses B3 as col=1, row=2', () => {
    expect(parseCellId('B3')).toEqual({ col: 1, row: 2 });
  });
  it('parses Z100 as col=25, row=99', () => {
    expect(parseCellId('Z100')).toEqual({ col: 25, row: 99 });
  });
  it('is case-insensitive', () => {
    expect(parseCellId('a1')).toEqual({ col: 0, row: 0 });
  });
  it('returns col=0, row=0 for invalid id', () => {
    expect(parseCellId('invalid')).toEqual({ col: 0, row: 0 });
  });
  it('maps multi-letter columns to COLS (marking out-of-bounds)', () => {
    expect(parseCellId('AA1').col).toBe(COLS);
  });
  it('round-trips with toCellId', () => {
    expect(parseCellId(toCellId(3, 5))).toEqual({ col: 3, row: 5 });
  });
});

describe('inBounds', () => {
  it('returns true for origin cell (0, 0)', () => {
    expect(inBounds(0, 0)).toBe(true);
  });
  it('returns true for last valid cell', () => {
    expect(inBounds(COLS - 1, ROWS - 1)).toBe(true);
  });
  it('returns false for negative column', () => {
    expect(inBounds(-1, 0)).toBe(false);
  });
  it('returns false for negative row', () => {
    expect(inBounds(0, -1)).toBe(false);
  });
  it('returns false for col === COLS (out of range)', () => {
    expect(inBounds(COLS, 0)).toBe(false);
  });
  it('returns false for row === ROWS (out of range)', () => {
    expect(inBounds(0, ROWS)).toBe(false);
  });
  it('returns true for interior cells', () => {
    expect(inBounds(5, 10)).toBe(true);
  });
});

describe('expandRange', () => {
  it('expands a single-cell range A1:A1', () => {
    expect(expandRange('A1', 'A1')).toEqual(['A1']);
  });

  it('expands a column range A1:A3', () => {
    expect(expandRange('A1', 'A3')).toEqual(['A1', 'A2', 'A3']);
  });

  it('expands a row range A1:C1', () => {
    expect(expandRange('A1', 'C1')).toEqual(['A1', 'B1', 'C1']);
  });

  it('expands a rectangular range A1:B2 in row-major order', () => {
    expect(expandRange('A1', 'B2')).toEqual(['A1', 'B1', 'A2', 'B2']);
  });

  it('handles reversed corners (B2:A1 === A1:B2)', () => {
    expect(expandRange('B2', 'A1')).toEqual(['A1', 'B1', 'A2', 'B2']);
  });

  it('expands a 3×3 range', () => {
    const result = expandRange('A1', 'C3');
    expect(result).toHaveLength(9);
    expect(result[0]).toBe('A1');
    expect(result[result.length - 1]).toBe('C3');
  });
});
