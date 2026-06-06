import { screen } from '@testing-library/react';
import { RowHeader } from './RowHeader';
import { useSpreadsheetStore } from '../../store/useSpreadsheetStore';
import { resetSpreadsheetStore, renderWithI18n } from '../../test-utils';

describe('RowHeader', () => {
  beforeEach(() => {
    resetSpreadsheetStore();
  });

  it('renders the 1-based row number', () => {
    renderWithI18n(<RowHeader row={4} height={28} top={112} />);
    expect(screen.getByRole('rowheader')).toHaveTextContent('5');
  });

  it('highlights the active row for the selected cell', () => {
    useSpreadsheetStore.getState().selectCell('A3');
    renderWithI18n(<RowHeader row={2} height={28} top={56} />);

    const header = screen.getByRole('rowheader');
    expect(header).toHaveClass('bg-slate-200');
    expect(header).toHaveClass('text-blue-600');
  });

  it('uses inactive styles for non-selected rows', () => {
    useSpreadsheetStore.getState().selectCell('A1');
    renderWithI18n(<RowHeader row={5} height={28} top={140} />);

    const header = screen.getByRole('rowheader');
    expect(header).toHaveClass('bg-gray-100');
    expect(header).toHaveClass('text-gray-600');
  });
});
