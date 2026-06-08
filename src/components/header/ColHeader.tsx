import { memo } from 'react';
import { colLetter, getRangeBounds, parseCellId } from '../../engine/RangeUtils';
import { useSelected, useSelectedRange } from '../../store/selectors';
import { absBox, CELL_BORDER, cn } from '../../ui/cn';
import { COL_HEADER_H } from '../../ui/grid.config';

interface ColHeaderProps {
  col: number;
  width: number;
  left: number;
}

function ColHeaderComponent({ col, width, left }: ColHeaderProps) {
  const selected = useSelected();
  const selectedRange = useSelectedRange();
  const { col: activeCol } = parseCellId(selected);
  const range = getRangeBounds(selectedRange.anchor, selectedRange.focus);
  const isActive = col === activeCol;
  const isInRange = col >= range.minCol && col <= range.maxCol;

  return (
    <div
      role="columnheader"
      className={cn(
        'flex items-center justify-center text-xs font-medium',
        isActive || isInRange
          ? 'bg-slate-200 text-blue-600'
          : 'bg-gray-100 text-gray-600',
      )}
      style={{
        ...absBox({ top: 0, left, width, height: COL_HEADER_H }),
        ...CELL_BORDER,
      }}
    >
      {colLetter(col)}
    </div>
  );
}

export const ColHeader = memo(ColHeaderComponent);
