import { useRef } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { useGridKeyboard } from './useGridKeyboard';
import { useSpreadsheetStore } from '../store/useSpreadsheetStore';
import { resetSpreadsheetStore } from '../test-utils';

function KeyboardHarness() {
  const ref = useRef<HTMLDivElement>(null);
  useGridKeyboard(ref);
  return (
    <div ref={ref} tabIndex={0} data-testid="grid">
      grid
    </div>
  );
}

describe('useGridKeyboard', () => {
  beforeEach(() => {
    resetSpreadsheetStore();
  });

  const getState = () => useSpreadsheetStore.getState();

  function keyDown(target: HTMLElement, key: string, opts: KeyboardEventInit = {}) {
    fireEvent.keyDown(target, { key, ...opts });
  }

  it('navigates with arrow keys when not editing', () => {
    const { getByTestId } = render(<KeyboardHarness />);
    const grid = getByTestId('grid');

    keyDown(grid, 'ArrowRight');
    expect(getState().selectedCell).toBe('B1');

    keyDown(grid, 'ArrowDown');
    expect(getState().selectedCell).toBe('B2');
  });

  it('enters edit mode on Enter and F2', () => {
    const { getByTestId } = render(<KeyboardHarness />);
    const grid = getByTestId('grid');

    keyDown(grid, 'Enter');
    expect(getState().editingCell).toBe('A1');

    getState().discardEdit();
    keyDown(grid, 'F2');
    expect(getState().editingCell).toBe('A1');
  });

  it('navigates up on Shift+Enter when not editing', () => {
    getState().selectCell('A2');
    const { getByTestId } = render(<KeyboardHarness />);
    keyDown(getByTestId('grid'), 'Enter', { shiftKey: true });
    expect(getState().selectedCell).toBe('A1');
  });

  it('tabs between cells when not editing', () => {
    const { getByTestId } = render(<KeyboardHarness />);
    const grid = getByTestId('grid');

    keyDown(grid, 'Tab');
    expect(getState().selectedCell).toBe('B1');

    keyDown(grid, 'Tab', { shiftKey: true });
    expect(getState().selectedCell).toBe('A1');
  });

  it('enters edit mode with a printable key as seed', () => {
    const { getByTestId } = render(<KeyboardHarness />);
    keyDown(getByTestId('grid'), 'x');
    expect(getState().editingCell).toBe('A1');
    expect(getState().editBuffer).toBe('x');
  });

  it('clears the selected cell on Delete', () => {
    getState().engine.setCellRaw('A1', 'remove me');
    const { getByTestId } = render(<KeyboardHarness />);
    keyDown(getByTestId('grid'), 'Delete');
    expect(getState().engine.getCell('A1').raw).toBe('');
  });

  it('commits edit on Enter when editing', () => {
    getState().enterEditMode('A1', '42');
    const { getByTestId } = render(<KeyboardHarness />);
    keyDown(getByTestId('grid'), 'Enter');
    expect(getState().editingCell).toBeNull();
    expect(getState().selectedCell).toBe('A2');
    expect(getState().engine.getCell('A1').raw).toBe('42');
  });

  it('discards edit on Escape when editing', () => {
    getState().engine.setCellRaw('A1', 'keep');
    getState().enterEditMode('A1');
    getState().updateBuffer('nope');

    const { getByTestId } = render(<KeyboardHarness />);
    keyDown(getByTestId('grid'), 'Escape');

    expect(getState().editingCell).toBeNull();
    expect(getState().engine.getCell('A1').raw).toBe('keep');
  });

  it('ignores printable keys with modifier keys', () => {
    const { getByTestId } = render(<KeyboardHarness />);
    keyDown(getByTestId('grid'), 'a', { ctrlKey: true });
    expect(getState().editingCell).toBeNull();
  });
});
