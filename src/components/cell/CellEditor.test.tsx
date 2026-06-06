import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CellEditor, CELL_EDITOR_INPUT } from './CellEditor';
import { useSpreadsheetStore } from '../../store/useSpreadsheetStore';
import { resetSpreadsheetStore, renderWithI18n } from '../../test-utils';

describe('CellEditor', () => {
  beforeEach(() => {
    resetSpreadsheetStore();
    useSpreadsheetStore.getState().enterEditMode('A1', 'edit me');
    useSpreadsheetStore.getState().setEditSource('cell');
  });

  it('renders a controlled input with the edit buffer', () => {
    renderWithI18n(<CellEditor />);
    const input = screen.getByLabelText('Cell editor');
    expect(input).toHaveValue('edit me');
    expect(input).toHaveAttribute(CELL_EDITOR_INPUT, '');
  });

  it('updates the store buffer on change', async () => {
    renderWithI18n(<CellEditor />);
    const input = screen.getByLabelText('Cell editor');

    await userEvent.clear(input);
    await userEvent.type(input, 'new value');

    expect(useSpreadsheetStore.getState().editBuffer).toBe('new value');
  });

  it('commits edit on blur when focus does not move to formula bar', () => {
    renderWithI18n(<CellEditor />);
    const input = screen.getByLabelText('Cell editor');
    fireEvent.blur(input, { relatedTarget: null });
    expect(useSpreadsheetStore.getState().editingCell).toBeNull();
    expect(useSpreadsheetStore.getState().engine.getCell('A1').raw).toBe('edit me');
  });

  it('switches edit source to formulaBar when blurring to formula bar input', () => {
    renderWithI18n(
      <>
        <CellEditor />
        <input data-formula-bar-input="" aria-label="formula" />
      </>,
    );
    const input = screen.getByLabelText('Cell editor');
    const formulaInput = screen.getByLabelText('formula');
    fireEvent.blur(input, { relatedTarget: formulaInput });

    expect(useSpreadsheetStore.getState().editingCell).toBe('A1');
    expect(useSpreadsheetStore.getState().editSource).toBe('formulaBar');
  });
});
