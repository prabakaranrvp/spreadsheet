export type CellId = string;

export type CellError =
  | 'CIRCULAR_REF'
  | 'DIV_ZERO'
  | 'INVALID_REF'
  | 'PARSE_ERROR'
  | 'NAME_ERROR';

export type CellType = 'empty' | 'number' | 'text' | 'formula';

export interface Cell {
  raw: string;
  computed: string | number | null;
  type: CellType;
  error?: CellError;
}

export type Direction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'tab'
  | 'shiftTab';
