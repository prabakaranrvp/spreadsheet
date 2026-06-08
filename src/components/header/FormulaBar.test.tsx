import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormulaBar } from './FormulaBar';
import { LiveRegion } from '../common/LiveRegion';
import { useSpreadsheetStore } from '../../store/useSpreadsheetStore';
import { resetSpreadsheetStore, renderWithI18n } from '../../test-utils';
import { CELL_EDITOR_INPUT } from '../cell/CellEditor';

function renderFormulaBar(props: { onCommit?: () => void } = {}) {
  // LiveRegion must mount first so announceFn is registered before FormulaBar's effect runs.
  return renderWithI18n(
    <>
      <LiveRegion />
      <FormulaBar {...props} />
    </>,
  );
}

describe('FormulaBar', () => {
  beforeEach(() => {
    resetSpreadsheetStore();
  });

  it('shows the selected cell reference and raw value', () => {
    useSpreadsheetStore.getState().engine.setCellRaw('B2', 'hello');
    useSpreadsheetStore.getState().selectCell('B2');
    useSpreadsheetStore.setState({ versions: new Map([['B2', 1]]) });

    renderFormulaBar();
    expect(screen.getByText('B2')).toBeInTheDocument();
    expect(screen.getByLabelText('Formula for cell B2')).toHaveValue('hello');
  });

  it('enters edit mode when the input is focused', async () => {
    renderFormulaBar();

    await userEvent.click(screen.getByLabelText('Formula for cell A1'));
    expect(useSpreadsheetStore.getState().editingCell).toBe('A1');
    expect(useSpreadsheetStore.getState().editSource).toBe('formulaBar');
  });

  it('updates the edit buffer while typing', async () => {
    renderFormulaBar();

    const input = screen.getByLabelText('Formula for cell A1');
    await userEvent.click(input);
    await userEvent.type(input, '123');

    expect(useSpreadsheetStore.getState().editBuffer).toBe('123');
  });

  it('keeps showing the edited formula while a referenced cell is selected', () => {
    renderFormulaBar();
    act(() => {
      useSpreadsheetStore.getState().enterEditMode('A1', '=SUM(', 'formulaBar');
      useSpreadsheetStore.getState().selectCell('B2');
    });

    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.getByLabelText('Formula for cell A1')).toHaveValue('=SUM(B2');
  });

  it('commits on Enter and moves selection down', () => {
    renderFormulaBar();
    useSpreadsheetStore.getState().enterEditMode('A1', '5', 'formulaBar');

    const input = screen.getByLabelText('Formula for cell A1');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useSpreadsheetStore.getState().editingCell).toBeNull();
    expect(useSpreadsheetStore.getState().selectedCell).toBe('A2');
    expect(useSpreadsheetStore.getState().engine.getCell('A1').raw).toBe('5');
  });

  it('commits on Shift+Enter and moves selection up', () => {
    useSpreadsheetStore.getState().selectCell('A2');
    renderFormulaBar();
    useSpreadsheetStore.getState().enterEditMode('A2', '9', 'formulaBar');

    const input = screen.getByLabelText('Formula for cell A2');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(useSpreadsheetStore.getState().selectedCell).toBe('A1');
  });

  it('discards edit on Escape', () => {
    useSpreadsheetStore.getState().engine.setCellRaw('A1', 'keep');
    useSpreadsheetStore.setState({ versions: new Map([['A1', 1]]) });
    renderFormulaBar();
    useSpreadsheetStore.getState().enterEditMode('A1', 'discard', 'formulaBar');

    const input = screen.getByLabelText('Formula for cell A1');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(useSpreadsheetStore.getState().editingCell).toBeNull();
    expect(useSpreadsheetStore.getState().engine.getCell('A1').raw).toBe('keep');
  });

  it('calls onCommit after keyboard commit actions', () => {
    const onCommit = jest.fn();
    renderFormulaBar({ onCommit });
    useSpreadsheetStore.getState().enterEditMode('A1', '1', 'formulaBar');

    fireEvent.keyDown(screen.getByLabelText('Formula for cell A1'), {
      key: 'Tab',
    });

    expect(onCommit).toHaveBeenCalled();
  });

  it('switches edit source to cell when blurring to cell editor', () => {
    renderFormulaBar();
    useSpreadsheetStore.getState().enterEditMode('A1', 'x', 'formulaBar');

    const formulaInput = screen.getByLabelText('Formula for cell A1');
    const cellInput = document.createElement('input');
    cellInput.setAttribute(CELL_EDITOR_INPUT, '');

    fireEvent.blur(formulaInput, { relatedTarget: cellInput });
    expect(useSpreadsheetStore.getState().editSource).toBe('cell');
  });

  it('announces the selected cell to the live region', async () => {
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });

    useSpreadsheetStore.getState().engine.setCellRaw('A1', '7');
    useSpreadsheetStore.setState({ versions: new Map([['A1', 1]]) });

    const { container } = renderFormulaBar();
    const region = container.querySelector('[aria-live="polite"]');

    await waitFor(() => {
      expect(region).toHaveTextContent(/Selected cell A1, value 7/);
    });
  });
});
