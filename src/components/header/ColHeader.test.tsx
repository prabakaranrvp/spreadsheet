import { screen } from '@testing-library/react';
import { ColHeader } from './ColHeader';
import { useSpreadsheetStore } from '../../store/useSpreadsheetStore';
import { resetSpreadsheetStore, renderWithI18n } from '../../test-utils';

describe('ColHeader', () => {
  beforeEach(() => {
    resetSpreadsheetStore();
  });

  it('renders the column letter', () => {
    renderWithI18n(<ColHeader col={2} width={96} left={192} />);
    expect(screen.getByRole('columnheader')).toHaveTextContent('C');
  });

  it('highlights the active column for the selected cell', () => {
    useSpreadsheetStore.getState().selectCell('B5');
    renderWithI18n(<ColHeader col={1} width={96} left={96} />);

    const header = screen.getByRole('columnheader');
    expect(header).toHaveClass('bg-slate-200');
    expect(header).toHaveClass('text-blue-600');
  });

  it('uses inactive styles for non-selected columns', () => {
    useSpreadsheetStore.getState().selectCell('A1');
    renderWithI18n(<ColHeader col={3} width={96} left={288} />);

    const header = screen.getByRole('columnheader');
    expect(header).toHaveClass('bg-gray-100');
    expect(header).toHaveClass('text-gray-600');
  });
});
