import {
  STORAGE_KEY,
  loadSnapshot,
  saveSnapshot,
  scheduleSave,
  clearSaved,
} from './persistence';

describe('persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    localStorage.clear();
  });

  describe('loadSnapshot', () => {
    it('returns null when storage is empty', () => {
      expect(loadSnapshot()).toBeNull();
    });

    it('returns sheet data for a valid envelope', () => {
      const sheet = { cells: [{ id: 'A1', raw: '42' }] };
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, savedAt: '2020-01-01', sheet }),
      );
      expect(loadSnapshot()).toEqual(sheet);
    });

    it('returns null and clears storage for wrong schema version', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 99, sheet: { cells: [] } }),
      );
      expect(loadSnapshot()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('returns null for corrupt JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json');
      expect(loadSnapshot()).toBeNull();
    });

    it('returns null when cells array is missing', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, sheet: {} }),
      );
      expect(loadSnapshot()).toBeNull();
    });
  });

  describe('saveSnapshot', () => {
    it('writes a versioned envelope to localStorage', () => {
      const sheet = { cells: [{ id: 'B2', raw: 'hello' }] };
      saveSnapshot(sheet);
      const doc = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(doc.version).toBe(1);
      expect(doc.sheet).toEqual(sheet);
      expect(doc.savedAt).toBeDefined();
    });
  });

  describe('scheduleSave', () => {
    it('debounces multiple calls into a single write', () => {
      scheduleSave({ cells: [{ id: 'A1', raw: '1' }] });
      scheduleSave({ cells: [{ id: 'A1', raw: '2' }] });
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

      jest.advanceTimersByTime(400);

      const doc = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(doc.sheet.cells).toEqual([{ id: 'A1', raw: '2' }]);
    });
  });

  describe('clearSaved', () => {
    it('removes the storage key', () => {
      saveSnapshot({ cells: [] });
      clearSaved();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
