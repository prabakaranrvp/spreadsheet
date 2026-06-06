import {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type CSSProperties,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import {
  ROWS,
  COLS,
  CELL_W,
  CELL_H,
  OVERSCAN,
  ROW_HEADER_W,
  COL_HEADER_H,
} from '../ui/grid.config';
import { useSelected, useEditing } from '../store/selectors';
import { useSpreadsheetStore } from '../store/useSpreadsheetStore';
import { parseCellId } from '../engine/RangeUtils';
import { absBox, CELL_BORDER } from '../ui/cn';
import { Cell } from './cell/Cell';
import { ColHeader } from './header/ColHeader';
import { RowHeader } from './header/RowHeader';
import { useGridKeyboard } from '../hooks/useGridKeyboard';

export interface VirtualGridHandle {
  focus: () => void;
}

const canvasStyle = (w: number, h: number): CSSProperties => ({
  position: 'relative',
  width: w,
  height: h,
});

export const VirtualGrid = forwardRef<VirtualGridHandle>(function VirtualGrid(
  _,
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const selectedCell = useSelected();
  const editingCell = useEditing();
  const editSource = useSpreadsheetStore((s) => s.editSource);
  const { col: selCol, row: selRow } = parseCellId(selectedCell);

  useGridKeyboard(scrollRef);

  // Single keyboard focus target for the grid; skip while an editor owns focus.
  useEffect(() => {
    const isEditingInCell = editingCell != null && editSource === 'cell';
    const isEditingInFormulaBar =
      editingCell != null && editSource === 'formulaBar';
    if (isEditingInCell || isEditingInFormulaBar) return;
    scrollRef.current?.focus();
  }, [selectedCell, editingCell, editSource]);

  useImperativeHandle(ref, () => ({
    focus: () => scrollRef.current?.focus(),
  }));

  const rowVirtualizer = useVirtualizer({
    count: ROWS,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CELL_H,
    overscan: OVERSCAN,
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: COLS,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CELL_W,
    overscan: OVERSCAN,
  });

  useEffect(() => {
    rowVirtualizer.scrollToIndex(selRow, { align: 'auto' });
    colVirtualizer.scrollToIndex(selCol, { align: 'auto' });
  }, [selRow, selCol, rowVirtualizer, colVirtualizer]);

  const totalWidth = colVirtualizer.getTotalSize();
  const totalHeight = rowVirtualizer.getTotalSize();
  const canvasW = totalWidth + ROW_HEADER_W;
  const canvasH = totalHeight + COL_HEADER_H;

  const getColStart = useCallback(
    (col: number) => {
      const item = colVirtualizer
        .getVirtualItems()
        .find((v) => v.index === col);
      return item?.start ?? col * CELL_W;
    },
    [colVirtualizer],
  );

  const getRowStart = useCallback(
    (row: number) => {
      const item = rowVirtualizer
        .getVirtualItems()
        .find((v) => v.index === row);
      return item?.start ?? row * CELL_H;
    },
    [rowVirtualizer],
  );

  const selLeft = ROW_HEADER_W + getColStart(selCol);
  const selTop = COL_HEADER_H + getRowStart(selRow);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden border border-gray-300">
      <div
        ref={scrollRef}
        role="grid"
        aria-label={t('grid.label')}
        tabIndex={0}
        className="relative h-full overflow-auto outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600/30"
      >
        <div style={canvasStyle(canvasW, canvasH)}>
          {/* Corner — sticky top-left */}
          <div
            className="sticky left-0 top-0 z-30 bg-gray-100"
            style={{
              width: ROW_HEADER_W,
              height: COL_HEADER_H,
              ...CELL_BORDER,
            }}
          />

          {/*
            Column headers — sticky top, pulled up to share the header row with corner.
            marginTop: -COL_HEADER_H cancels the corner's flow height.
          */}
          <div
            className="sticky top-0 z-20"
            style={{
              position: 'sticky',
              marginLeft: ROW_HEADER_W,
              marginTop: -COL_HEADER_H,
              width: totalWidth,
              height: COL_HEADER_H,
            }}
          >
            {colVirtualizer.getVirtualItems().map((virtualCol) => (
              <ColHeader
                key={virtualCol.key}
                col={virtualCol.index}
                width={virtualCol.size}
                left={virtualCol.start}
              />
            ))}
          </div>

          {/* Row headers — sticky left, flow starts below the header band (y = COL_HEADER_H) */}
          <div
            className="sticky left-0 z-20"
            style={{
              position: 'sticky',
              width: ROW_HEADER_W,
              height: totalHeight,
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => (
              <RowHeader
                key={virtualRow.key}
                row={virtualRow.index}
                height={virtualRow.size}
                top={virtualRow.start}
              />
            ))}
          </div>

          {/* Cell body — same origin as row/col headers */}
          <div
            role="rowgroup"
            style={absBox({
              top: COL_HEADER_H,
              left: ROW_HEADER_W,
              width: totalWidth,
              height: totalHeight,
            })}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) =>
              colVirtualizer.getVirtualItems().map((virtualCol) => (
                <div
                  key={`${virtualRow.key}-${virtualCol.key}`}
                  role="row"
                  style={absBox({
                    top: virtualRow.start,
                    left: virtualCol.start,
                    width: virtualCol.size,
                    height: virtualRow.size,
                  })}
                >
                  <Cell col={virtualCol.index} row={virtualRow.index} />
                </div>
              )),
            )}
          </div>

          {/* Selection overlay */}
          <div
            aria-hidden="true"
            className="pointer-events-none z-10 border-2 border-blue-600 bg-blue-600/10"
            style={absBox({
              top: selTop,
              left: selLeft,
              width: CELL_W,
              height: CELL_H,
            })}
          />
        </div>
      </div>
    </div>
  );
});
