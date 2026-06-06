import { EMPTY_CELL, createEmptyCell, classifyRaw } from './CellStore';

describe('EMPTY_CELL', () => {
  it('is a frozen object', () => {
    expect(Object.isFrozen(EMPTY_CELL)).toBe(true);
  });

  it('has the correct shape', () => {
    expect(EMPTY_CELL).toEqual({ raw: '', computed: null, type: 'empty' });
  });
});

describe('createEmptyCell', () => {
  it('returns a cell with the correct shape', () => {
    expect(createEmptyCell()).toEqual({ raw: '', computed: null, type: 'empty' });
  });

  it('returns a distinct object on every call', () => {
    expect(createEmptyCell()).not.toBe(createEmptyCell());
  });

  it('is not the same reference as EMPTY_CELL', () => {
    expect(createEmptyCell()).not.toBe(EMPTY_CELL);
  });
});

describe('classifyRaw', () => {
  it('classifies empty string as empty', () => {
    expect(classifyRaw('')).toBe('empty');
  });

  it('classifies "=" prefix as formula', () => {
    expect(classifyRaw('=A1+1')).toBe('formula');
  });

  it('classifies just "=" as formula', () => {
    expect(classifyRaw('=')).toBe('formula');
  });

  it('classifies a positive integer string as number', () => {
    expect(classifyRaw('42')).toBe('number');
  });

  it('classifies zero as number', () => {
    expect(classifyRaw('0')).toBe('number');
  });

  it('classifies a decimal number as number', () => {
    expect(classifyRaw('3.14')).toBe('number');
  });

  it('classifies a negative number as number', () => {
    expect(classifyRaw('-5')).toBe('number');
  });

  it('classifies a plain text string as text', () => {
    expect(classifyRaw('hello')).toBe('text');
  });

  it('classifies whitespace-only string as text (trim prevents numeric parse)', () => {
    expect(classifyRaw('   ')).toBe('text');
  });

  it('classifies alphanumeric string as text', () => {
    expect(classifyRaw('A1B2')).toBe('text');
  });
});
