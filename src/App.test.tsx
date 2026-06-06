import { screen } from '@testing-library/react';
import App from './components/App';
import { resetSpreadsheetStore, renderWithI18n } from './test-utils';

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

describe('App', () => {
  beforeEach(() => {
    resetSpreadsheetStore();
  });

  it('renders the spreadsheet title', () => {
    renderWithI18n(<App />);
    expect(screen.getByRole('heading', { name: 'Spreadsheet' })).toBeInTheDocument();
  });

  it('renders the formula bar and grid', () => {
    renderWithI18n(<App />);
    expect(screen.getByLabelText('Formula bar')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Spreadsheet grid' })).toBeInTheDocument();
  });

  it('renders the live region for screen reader announcements', () => {
    const { container } = renderWithI18n(<App />);
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });
});

