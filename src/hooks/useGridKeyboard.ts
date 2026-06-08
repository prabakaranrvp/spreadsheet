import { useEffect, RefObject } from 'react';
import { useSpreadsheetStore } from '../store/useSpreadsheetStore';

function isPrintableKey(e: KeyboardEvent): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key.length === 1) return e.key;
  return null;
}

export function useGridKeyboard(
  containerRef: RefObject<HTMLElement | null>,
) {
  const editingCell = useSpreadsheetStore((s) => s.editingCell);
  const selectedCell = useSpreadsheetStore((s) => s.selectedCell);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const {
        enterEditMode,
        commitEdit,
        discardEdit,
        navigate,
        clearSelection,
      } = useSpreadsheetStore.getState();

      const isEditing = useSpreadsheetStore.getState().editingCell != null;
      const sel = useSpreadsheetStore.getState().selectedCell;

      if (isEditing) {
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            commitEdit({ then: e.shiftKey ? 'up' : 'down' });
            break;
          case 'Tab':
            e.preventDefault();
            commitEdit({ then: e.shiftKey ? 'shiftTab' : 'tab' });
            break;
          case 'Escape':
            e.preventDefault();
            discardEdit();
            break;
          default:
            break;
        }
        return;
      }

      // NAVIGATE mode
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          navigate('up', { extend: e.shiftKey });
          break;
        case 'ArrowDown':
          e.preventDefault();
          navigate('down', { extend: e.shiftKey });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          navigate('left', { extend: e.shiftKey });
          break;
        case 'ArrowRight':
          e.preventDefault();
          navigate('right', { extend: e.shiftKey });
          break;
        case 'Enter':
          e.preventDefault();
          if (e.shiftKey) {
            navigate('up');
          } else {
            enterEditMode(sel);
          }
          break;
        case 'Tab':
          e.preventDefault();
          navigate(e.shiftKey ? 'shiftTab' : 'tab');
          break;
        case 'F2':
          e.preventDefault();
          enterEditMode(sel);
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          clearSelection();
          break;
        default: {
          const char = isPrintableKey(e);
          if (char) {
            e.preventDefault();
            enterEditMode(sel, char);
          }
          break;
        }
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (useSpreadsheetStore.getState().editingCell != null) return;
      const text = useSpreadsheetStore.getState().getSelectionClipboardText();
      e.preventDefault();
      e.clipboardData?.setData('text/plain', text);
    };

    el.addEventListener('keydown', handleKeyDown);
    el.addEventListener('copy', handleCopy);
    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      el.removeEventListener('copy', handleCopy);
    };
  }, [containerRef, editingCell, selectedCell]);
}
