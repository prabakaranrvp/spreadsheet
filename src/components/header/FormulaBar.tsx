import { useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useSelected,
  useEditing,
  useEditBuffer,
  useEditCursor,
  useEditSource,
  useCell,
} from '../../store/selectors';
import { useSpreadsheetStore } from '../../store/useSpreadsheetStore';
import { displayValue } from '../../ui/format';
import { useNumberFormat } from '../../i18n';
import { announce } from '../common/LiveRegion';
import { CELL_EDITOR_INPUT } from '../cell/CellEditor';

interface FormulaBarProps {
  onCommit?: () => void;
}

export function FormulaBar({ onCommit }: FormulaBarProps) {
  const { t } = useTranslation();
  const nf = useNumberFormat();
  const selectedCell = useSelected();
  const editingCell = useEditing();
  const editSource = useEditSource();
  const editBuffer = useEditBuffer();
  const editCursor = useEditCursor();
  const formulaCell = editingCell ?? selectedCell;
  const cell = useCell(formulaCell);
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRefId = 'formula-bar-cell-ref';

  const enterEditMode = useSpreadsheetStore((s) => s.enterEditMode);
  const setEditSource = useSpreadsheetStore((s) => s.setEditSource);
  const updateBuffer = useSpreadsheetStore((s) => s.updateBuffer);
  const setEditCursor = useSpreadsheetStore((s) => s.setEditCursor);
  const commitEdit = useSpreadsheetStore((s) => s.commitEdit);
  const discardEdit = useSpreadsheetStore((s) => s.discardEdit);

  const isEditing = editingCell != null;
  const displayRaw = isEditing ? editBuffer : cell.raw;

  useEffect(() => {
    const value = displayValue(cell, t, nf);
    announce(
      t('a11y.selectedCell', { ref: selectedCell, value: value || 'empty' }),
    );
  }, [selectedCell, cell, t, nf]);

  useEffect(() => {
    if (isEditing && editSource === 'formulaBar') {
      inputRef.current?.focus();
      const len = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(len, len);
    }
  }, [isEditing, editSource, formulaCell]);

  useEffect(() => {
    if (editCursor == null || document.activeElement !== inputRef.current) return;
    inputRef.current?.setSelectionRange(editCursor, editCursor);
  }, [displayRaw, editCursor]);

  const handleFocus = useCallback(() => {
    if (editingCell != null) {
      setEditSource('formulaBar');
    } else {
      enterEditMode(selectedCell, undefined, 'formulaBar');
    }
  }, [editingCell, selectedCell, setEditSource, enterEditMode]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      updateBuffer(e.target.value, e.target.selectionStart),
    [updateBuffer],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const next = e.relatedTarget;
      if (next instanceof Element && next.closest(`[${CELL_EDITOR_INPUT}]`)) {
        setEditSource('cell');
        return;
      }
      commitEdit();
    },
    [commitEdit, setEditSource],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit({ then: e.shiftKey ? 'up' : 'down' });
        onCommit?.();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit({ then: e.shiftKey ? 'shiftTab' : 'tab' });
        onCommit?.();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        discardEdit();
        onCommit?.();
      }
    },
    [commitEdit, discardEdit, onCommit],
  );

  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5"
      aria-label={t('formulaBar.label')}
    >
      <div
        id={cellRefId}
        className="flex h-7 w-14 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-700"
        aria-label={t('formulaBar.cellRef')}
      >
        {formulaCell}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span className="shrink-0 text-sm text-gray-400" aria-hidden="true">
          ƒx
        </span>
        <input
          ref={inputRef}
          type="text"
          value={displayRaw}
          onFocus={handleFocus}
          onChange={handleChange}
          onSelect={(e) => setEditCursor(e.currentTarget.selectionStart)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          aria-label={t('formulaBar.aria', { ref: formulaCell })}
          aria-describedby={cellRefId}
          data-formula-bar-input=""
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600/30"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
