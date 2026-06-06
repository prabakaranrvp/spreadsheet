import type { SerializedSheet } from '../engine/SpreadsheetEngine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'tekion.spreadsheet.v1';
const SCHEMA_VERSION = 1;
const DEBOUNCE_MS = 400;

// ---------------------------------------------------------------------------
// Envelope type
// ---------------------------------------------------------------------------

interface PersistedDoc {
  version: number;
  savedAt: string;
  sheet: SerializedSheet;
}

// ---------------------------------------------------------------------------
// Load (called once at store creation)
// ---------------------------------------------------------------------------

/**
 * Read and validate the persisted sheet from localStorage.
 * Returns null on any error (missing key, corrupt JSON, wrong schema version).
 * Never throws.
 */
export function loadSnapshot(): SerializedSheet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw) as PersistedDoc;
    if (doc?.version !== SCHEMA_VERSION) {
      clearSaved();
      return null;
    }
    if (!Array.isArray(doc?.sheet?.cells)) return null;
    return doc.sheet;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Save (called by the store on every mutating commit)
// ---------------------------------------------------------------------------

/**
 * Write the sheet envelope to localStorage.
 * Any storage error (quota, private mode) is logged and silently ignored —
 * persistence is best-effort and must never block editing.
 */
export function saveSnapshot(sheet: SerializedSheet): void {
  try {
    const doc: PersistedDoc = {
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      sheet,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch (err) {
    console.warn('[persistence] Failed to save snapshot:', err);
  }
}

// ---------------------------------------------------------------------------
// Debounced save scheduler
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSheet: SerializedSheet | null = null;

function flushSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingSheet !== null) {
    saveSnapshot(pendingSheet);
    pendingSheet = null;
  }
}

/**
 * Schedule a debounced save.  Multiple rapid calls collapse into a single
 * localStorage write after DEBOUNCE_MS of inactivity.
 */
export function scheduleSave(sheet: SerializedSheet): void {
  pendingSheet = sheet;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------

export function clearSaved(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore — private mode or storage disabled
  }
}

// ---------------------------------------------------------------------------
// Flush on page unload / tab hide (never lose the last edit on reload)
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
}
