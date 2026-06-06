import { memo, useCallback, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toCellId } from '../../engine/RangeUtils';
import { useCell, useEditing, useEditSource, useSelected } from '../../store/selectors';
import { useSpreadsheetStore } from '../../store/useSpreadsheetStore';
import { displayValue, cellClasses } from '../../ui/format';
import { useNumberFormat } from '../../i18n';
import { CELL_BORDER, cn } from '../../ui/cn';
import { CellEditor } from './CellEditor';

interface CellProps {
  col: number;
  row: number;
}

function CellComponent({ col, row }: CellProps) {
  const id = toCellId(col, row);
  const cell = useCell(id);
  const selectedCell = useSelected();
  const editingCell = useEditing();
  const editSource = useEditSource();
  const editBuffer = useSpreadsheetStore((s) =>
    s.editingCell === id ? s.editBuffer : '',
  );
  const { t } = useTranslation();
  const nf = useNumberFormat();
  const selectCell = useSpreadsheetStore((s) => s.selectCell);
  const enterEditMode = useSpreadsheetStore((s) => s.enterEditMode);

  const isSelected = selectedCell === id;
  const isBeingEdited = editingCell === id;
  const isEditingInCell = isBeingEdited && editSource === 'cell';

  const handleMouseDown = useCallback((e: MouseEvent) => {
    // Keep focus on the grid container so keyboard navigation stays active.
    e.preventDefault();
  }, []);
  const handleClick = useCallback(() => selectCell(id), [id, selectCell]);
  const handleDoubleClick = useCallback(
    () => enterEditMode(id),
    [id, enterEditMode],
  );

  return (
    <div
      role="gridcell"
      aria-selected={false}
      className={cn(
        'relative h-full w-full bg-white outline-none transition-[background-color,box-shadow] duration-100',
        !isSelected &&
          'hover:bg-gray-50 hover:ring-1 hover:ring-inset hover:ring-gray-300/60',
      )}
      style={CELL_BORDER}
      onMouseDown={handleMouseDown}
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
