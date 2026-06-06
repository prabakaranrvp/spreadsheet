import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toCellId } from '../../engine/RangeUtils';
import { useCell, useEditing, useEditSource } from '../../store/selectors';
import { useSpreadsheetStore } from '../../store/useSpreadsheetStore';
import { displayValue, cellClasses } from '../../ui/format';
import { useNumberFormat } from '../../i18n';
import { CELL_BORDER } from '../../ui/cn';
import { CellEditor } from './CellEditor';

interface CellProps {
  col: number;
  row: number;
}

function CellComponent({ col, row }: CellProps) {
  const id = toCellId(col, row);
  const cell = useCell(id);
  const editingCell = useEditing();
  const editSource = useEditSource();
  const editBuffer = useSpreadsheetStore((s) =>
    s.editingCell === id ? s.editBuffer : '',
  );
  const { t } = useTranslation();
  const nf = useNumberFormat();
  const selectCell = useSpreadsheetStore((s) => s.selectCell);
  const enterEditMode = useSpreadsheetStore((s) => s.enterEditMode);

  const isBeingEdited = editingCell === id;
  const isEditingInCell = isBeingEdited && editSource === 'cell';

  const handleClick = useCallback(() => selectCell(id), [id, selectCell]);
  const handleDoubleClick = useCallback(
    () => enterEditMode(id),
    [id, enterEditMode],
  );

  return (
    <div
      role="gridcell"
      tabIndex={-1}
      aria-selected={false}
      className="relative h-full w-full bg-white"
      style={CELL_BORDER}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {!isBeingEdited && (
        <span className={cellClasses(cell)}>
          {displayValue(cell, t, nf)}
        </span>
      )}
      {isBeingEdited && !isEditingInCell && (
        <span className="block truncate px-1 text-[13px] leading-cellh text-gray-900">
          {editBuffer}
        </span>
      )}
      {isEditingInCell && <CellEditor />}
    </div>
  );
}

export const Cell = memo(CellComponent);
