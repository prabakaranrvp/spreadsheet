import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import './i18n';
import { useSpreadsheetStore } from './store/useSpreadsheetStore';
import { clearSaved } from './store/persistence';

export function renderWithI18n(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, options);
}

/** Reset the singleton store and clear persisted data between tests. */
export function resetSpreadsheetStore(): void {
  const { engine } = useSpreadsheetStore.getState();
  engine.restore({ cells: [] });
  useSpreadsheetStore.setState({
    versions: new Map(),
    selectedCell: 'A1',
    selectionAnchor: 'A1',
    selectionFocus: 'A1',
    editingCell: null,
    editSource: null,
    editBuffer: '',
    editCursor: null,
    formulaReferenceSpan: null,
  });
  clearSaved();
}
