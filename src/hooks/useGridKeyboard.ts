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
        clearCell,
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
          navigate('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          navigate('down');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          navigate('left');
          break;
        case 'ArrowRight':
          e.preventDefault();
          navigate('right');
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
          clearCell(sel);
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

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, editingCell, selectedCell]);
}
