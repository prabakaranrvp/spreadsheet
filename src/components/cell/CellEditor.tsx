import { useEffect, useRef } from 'react';
import { useSpreadsheetStore } from '../../store/useSpreadsheetStore';
import { useEditBuffer } from '../../store/selectors';

export const CELL_EDITOR_INPUT = 'data-cell-editor-input';

export function CellEditor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const editBuffer = useEditBuffer();
  const updateBuffer = useSpreadsheetStore((s) => s.updateBuffer);
  const setEditSource = useSpreadsheetStore((s) => s.setEditSource);
  const commitEdit = useSpreadsheetStore((s) => s.commitEdit);

  useEffect(() => {
    inputRef.current?.focus();
    const len = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(len, len);
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={editBuffer}
      onChange={(e) => updateBuffer(e.target.value)}
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (next instanceof Element && next.closest('[data-formula-bar-input]')) {
          setEditSource('formulaBar');
          return;
        }
        commitEdit();
      }}
      {...{ [CELL_EDITOR_INPUT]: '' }}
      className="absolute inset-0 z-10 h-full w-full border-2 border-blue-600 bg-white px-1 text-[13px] leading-cellh outline-none ring-0"
      aria-label="Cell editor"
    />
  );
}
