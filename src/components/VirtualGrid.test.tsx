import { createRef } from 'react';
import { screen } from '@testing-library/react';
import { VirtualGrid, type VirtualGridHandle } from './VirtualGrid';
import { useSpreadsheetStore } from '../store/useSpreadsheetStore';
import { resetSpreadsheetStore, renderWithI18n } from '../test-utils';

jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    horizontal,
  }: {
    count: number;
    horizontal?: boolean;
  }) => {
    const size = horizontal ? 96 : 28;
    const visible = Math.min(count, 5);
    const items = Array.from({ length: visible }, (_, index) => ({
      key: `${horizontal ? 'col' : 'row'}-${index}`,
      index,
      start: index * size,
      size,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * size,
      scrollToIndex: jest.fn(),
    };
  },
}));

describe('VirtualGrid', () => {
  beforeEach(() => {
    resetSpreadsheetStore();
  });

  it('renders an accessible grid with column and row headers', () => {
    renderWithI18n(<VirtualGrid />);

    expect(screen.getByRole('grid', { name: 'Spreadsheet grid' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('rowheader').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('gridcell').length).toBeGreaterThan(0);
  });

  it('exposes a focus handle via ref', () => {
    const ref = createRef<VirtualGridHandle>();
    renderWithI18n(<VirtualGrid ref={ref} />);

    expect(ref.current?.focus).toBeDefined();
    ref.current?.focus();
    expect(screen.getByRole('grid')).toHaveFocus();
  });

  it('renders visible cells for the current selection column and row', () => {
    useSpreadsheetStore.getState().engine.setCellRaw('A1', 'visible');
    useSpreadsheetStore.setState({
      versions: new Map([['A1', 1]]),
    });

    renderWithI18n(<VirtualGrid />);
    expect(screen.getByText('visible')).toBeInTheDocument();
  });
});
