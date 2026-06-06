import { useSpreadsheetStore } from './useSpreadsheetStore';
import { resetSpreadsheetStore } from '../test-utils';
import { STORAGE_KEY } from './persistence';

describe('useSpreadsheetStore', () => {
  beforeEach(() => {
    resetSpreadsheetStore();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const getState = () => useSpreadsheetStore.getState();

  describe('selectCell', () => {
    it('updates selectedCell', () => {
      getState().selectCell('C3');
      expect(getState().selectedCell).toBe('C3');
    });

    it('commits an in-progress edit when selecting a different cell', () => {
      getState().enterEditMode('A1', '99');
      getState().selectCell('B1');
      expect(getState().editingCell).toBeNull();
      expect(getState().engine.getCell('A1').raw).toBe('99');
    });
  });

  describe('enterEditMode', () => {
    it('seeds the buffer from the cell raw value by default', () => {
      getState().engine.setCellRaw('A1', 'hello');
      getState().enterEditMode('A1');
      expect(getState().editingCell).toBe('A1');
      expect(getState().editBuffer).toBe('hello');
      expect(getState().editSource).toBe('cell');
    });

    it('accepts a seed character and custom edit source', () => {
      getState().enterEditMode('A1', 'x', 'formulaBar');
      expect(getState().editBuffer).toBe('x');
      expect(getState().editSource).toBe('formulaBar');
    });
  });

  describe('setEditSource', () => {
    it('updates edit source only while editing', () => {
      getState().setEditSource('formulaBar');
      expect(getState().editSource).toBeNull();

      getState().enterEditMode('A1');
      getState().setEditSource('formulaBar');
      expect(getState().editSource).toBe('formulaBar');
    });
  });

  describe('updateBuffer', () => {
    it('updates editBuffer', () => {
      getState().enterEditMode('A1');
      getState().updateBuffer('=1+2');
      expect(getState().editBuffer).toBe('=1+2');
    });
  });

  describe('commitEdit', () => {
    it('writes changed values to the engine and bumps versions', () => {
      getState().enterEditMode('A1', '10');
      getState().commitEdit();
      expect(getState().editingCell).toBeNull();
      expect(getState().engine.getCell('A1').computed).toBe(10);
      expect(getState().versions.get('A1')).toBe(1);
    });

    it('skips engine write when value is unchanged', () => {
      getState().engine.setCellRaw('A1', '5');
      getState().enterEditMode('A1');
      getState().commitEdit();
      expect(getState().versions.get('A1')).toBeUndefined();
    });

    it('navigates after commit when opts.then is provided', () => {
      getState().enterEditMode('A1', '1');
      getState().commitEdit({ then: 'right' });
      expect(getState().selectedCell).toBe('B1');
    });

    it('navigates without editing when no cell is being edited', () => {
      getState().commitEdit({ then: 'down' });
      expect(getState().selectedCell).toBe('A2');
    });

    it('schedules a debounced save on mutation', () => {
      getState().enterEditMode('A1', '7');
      getState().commitEdit();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      jest.advanceTimersByTime(400);
      const doc = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(doc.sheet.cells).toEqual([{ id: 'A1', raw: '7' }]);
    });
  });

  describe('discardEdit', () => {
    it('clears edit state without writing to the engine', () => {
      getState().engine.setCellRaw('A1', 'keep');
      getState().enterEditMode('A1');
      getState().updateBuffer('discard');
      getState().discardEdit();
      expect(getState().editingCell).toBeNull();
      expect(getState().engine.getCell('A1').raw).toBe('keep');
    });
  });

  describe('navigate', () => {
    it('moves selection in each direction within bounds', () => {
      getState().selectCell('B2');
      getState().navigate('left');
      expect(getState().selectedCell).toBe('A2');
      getState().navigate('right');
      expect(getState().selectedCell).toBe('B2');
      getState().navigate('up');
      expect(getState().selectedCell).toBe('B1');
      getState().navigate('down');
      expect(getState().selectedCell).toBe('B2');
    });

    it('clamps at grid edges', () => {
      getState().selectCell('A1');
      getState().navigate('left');
      expect(getState().selectedCell).toBe('A1');
      getState().navigate('up');
      expect(getState().selectedCell).toBe('A1');
    });
  });

  describe('clearCell', () => {
    it('clears a non-empty cell and bumps versions', () => {
      getState().engine.setCellRaw('A1', 'text');
      getState().clearCell('A1');
      expect(getState().engine.getCell('A1').raw).toBe('');
      expect(getState().versions.get('A1')).toBe(1);
    });

    it('is a no-op for already empty cells', () => {
      getState().clearCell('A1');
      expect(getState().versions.get('A1')).toBeUndefined();
    });
  });
});
