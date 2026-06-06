import { useMemo } from 'react';
import type { CellId } from '../engine/types';
import { useSpreadsheetStore } from './useSpreadsheetStore';

export function useCell(id: CellId) {
  const version = useSpreadsheetStore((s) => s.versions.get(id) ?? 0);
  const getCell = useSpreadsheetStore((s) => s.getCell);
  // `version` is the reactive bridge: when it bumps, we re-read from the engine
  // even though `getCell` is a stable reference (LLD §3.2).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getCell(id), [getCell, id, version]);
}

export const useSelected = () =>
  useSpreadsheetStore((s) => s.selectedCell);

export const useEditing = () =>
  useSpreadsheetStore((s) => s.editingCell);

export const useEditBuffer = () =>
  useSpreadsheetStore((s) => s.editBuffer);

export const useEditSource = () =>
  useSpreadsheetStore((s) => s.editSource);
