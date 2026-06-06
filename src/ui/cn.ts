import type { CSSProperties } from 'react';

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Absolute box — used for virtualizer positioning (Tailwind can't JIT runtime px values). */
export function absBox(opts: {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
}): CSSProperties {
  return {
    position: 'absolute',
    ...(opts.top != null && { top: opts.top }),
    ...(opts.left != null && { left: opts.left }),
    ...(opts.width != null && { width: opts.width }),
    ...(opts.height != null && { height: opts.height }),
  };
}

export const CELL_BORDER: CSSProperties = {
  borderBottom: '1px solid #d1d5db',
  borderRight: '1px solid #d1d5db',
  boxSizing: 'border-box',
};
