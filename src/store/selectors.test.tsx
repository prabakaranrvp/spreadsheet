import { renderHook, act } from '@testing-library/react';
import {
  useCell,
  useSelected,
  useSelectedRange,
  useEditing,
  useEditBuffer,
  useEditCursor,
  useEditSource,
} from './selectors';
import { useSpreadsheetStore } from './useSpreadsheetStore';
import { resetSpreadsheetStore } from '../test-utils';

describe('selectors', () => {
  beforeEach(() => {
    resetSpreadsheetStore();
  });

  it('useSelected reflects selectedCell', () => {
    const { result } = renderHook(() => useSelected());
    expect(result.current).toBe('A1');

    act(() => useSpreadsheetStore.getState().selectCell('D4'));
    expect(result.current).toBe('D4');
  });

  it('useSelectedRange reflects the active range', () => {
    const { result } = renderHook(() => useSelectedRange());
    act(() => {
      useSpreadsheetStore.getState().selectCell('B2');
      useSpreadsheetStore.getState().selectCell('C3', { extend: true });
    });
    expect(result.current).toEqual({ anchor: 'B2', focus: 'C3' });
  });

  it('useEditing reflects editingCell', () => {
    const { result } = renderHook(() => useEditing());
    expect(result.current).toBeNull();

    act(() => useSpreadsheetStore.getState().enterEditMode('A1'));
    expect(result.current).toBe('A1');
  });

  it('useEditBuffer reflects editBuffer', () => {
    const { result } = renderHook(() => useEditBuffer());
    act(() => {
      useSpreadsheetStore.getState().enterEditMode('A1', 'seed');
    });
    expect(result.current).toBe('seed');
  });

  it('useEditCursor reflects editCursor', () => {
    const { result } = renderHook(() => useEditCursor());
    act(() => {
      useSpreadsheetStore.getState().enterEditMode('A1', '=1');
      useSpreadsheetStore.getState().setEditCursor(1);
    });
    expect(result.current).toBe(1);
  });

  it('useEditSource reflects editSource', () => {
    const { result } = renderHook(() => useEditSource());
    act(() => {
      useSpreadsheetStore.getState().enterEditMode('A1', undefined, 'formulaBar');
    });
    expect(result.current).toBe('formulaBar');
  });

  it('useCell re-reads from engine when version bumps', () => {
    const { result } = renderHook(() => useCell('A1'));
    expect(result.current.raw).toBe('');

    act(() => {
      useSpreadsheetStore.getState().enterEditMode('A1', '42');
      useSpreadsheetStore.getState().commitEdit();
    });

    expect(result.current.raw).toBe('42');
    expect(result.current.computed).toBe(42);
  });
});
