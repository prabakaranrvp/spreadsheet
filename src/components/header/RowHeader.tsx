import { memo } from 'react';
import { parseCellId } from '../../engine/RangeUtils';
import { useSelected } from '../../store/selectors';
import { absBox, CELL_BORDER, cn } from '../../ui/cn';
import { ROW_HEADER_W } from '../../ui/grid.config';

interface RowHeaderProps {
  row: number;
  height: number;
  top: number;
}

function RowHeaderComponent({ row, height, top }: RowHeaderProps) {
  const selected = useSelected();
  const { row: activeRow } = parseCellId(selected);
  const isActive = row === activeRow;

  return (
    <div
      role="rowheader"
      className={cn(
        'flex items-center justify-center text-xs font-medium',
        isActive
          ? 'bg-slate-200 text-blue-600'
          : 'bg-gray-100 text-gray-600',
      )}
      style={{
        ...absBox({ top, left: 0, width: ROW_HEADER_W, height }),
        ...CELL_BORDER,
      }}
    >
      {row + 1}
    </div>
  );
}

export const RowHeader = memo(RowHeaderComponent);
