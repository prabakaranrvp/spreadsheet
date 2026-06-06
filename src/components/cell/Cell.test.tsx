import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Cell } from './Cell';
import { useSpreadsheetStore } from '../../store/useSpreadsheetStore';
import { resetSpreadsheetStore, renderWithI18n } from '../../test-utils';

describe('Cell', () => {
  beforeEach(() => {
    resetSpreadsheetStore();
  });

  it('renders as a gridcell with displayed value', () => {
    useSpreadsheetStore.getState().engine.setCellRaw('A1', '42');
    useSpreadsheetStore.setState({
      versions: new Map([['A1', 1]]),
    });

    renderWithI18n(<Cell col={0} row={0} />);
    const cell = screen.getByRole('gridcell');
    expect(cell).toHaveTextContent('42');
  });

  it('selects the cell on click', async () => {
    renderWithI18n(<Cell col={1} row={2} />);

    await userEvent.click(screen.getByRole('gridcell'));
    expect(useSpreadsheetStore.getState().selectedCell).toBe('B3');
  });

  it('enters edit mode on double click', async () => {
    useSpreadsheetStore.getState().engine.setCellRaw('C4', 'hi');
    useSpreadsheetStore.setState({
      selectedCell: 'C4',
      versions: new Map([['C4', 1]]),
    });

    renderWithI18n(<Cell col={2} row={3} />);
    await userEvent.dblClick(screen.getByRole('gridcell'));

    expect(useSpreadsheetStore.getState().editingCell).toBe('C4');
    expect(useSpreadsheetStore.getState().editSource).toBe('cell');
  });

  it('shows the cell editor when editing in-cell', () => {
    useSpreadsheetStore.getState().enterEditMode('A1', 'typing', 'cell');

    renderWithI18n(<Cell col={0} row={0} />);
    expect(screen.getByLabelText('Cell editor')).toBeInTheDocument();
  });

  it('shows edit buffer in display mode when editing from formula bar', () => {
    useSpreadsheetStore.getState().enterEditMode('A1', 'from bar', 'formulaBar');

    renderWithI18n(<Cell col={0} row={0} />);
    expect(screen.getByText('from bar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cell editor')).not.toBeInTheDocument();
  });
});
