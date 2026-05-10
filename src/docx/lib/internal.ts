// Shared internals for the table helpers. Not part of the public API.

import { TableCell, WidthType, VerticalAlign, BorderStyle } from 'docx';
import type { Paragraph } from 'docx';
import { FULL_BORDERS, CELL_MARGINS, HEADER_SHADING } from './defaults';

const NO_BORDERS = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

// Build a TableCell with house-style borders, padding, and centered vertical alignment.
// Pass `borders: 'none'` for invisible cells (used as gutters between adjacent
// sub-tables in two-sided sig blocks).
export const cell = (
  children: Paragraph[],
  width: number,
  opts: { header?: boolean; columnSpan?: number; borders?: 'none' } = {},
) => new TableCell({
  borders: opts.borders === 'none' ? NO_BORDERS : FULL_BORDERS,
  width: { size: width, type: WidthType.DXA },
  margins: CELL_MARGINS,
  verticalAlign: VerticalAlign.CENTER,
  children,
  ...(opts.header ? { shading: HEADER_SHADING } : {}),
  ...(opts.columnSpan ? { columnSpan: opts.columnSpan } : {}),
});

// Resolve a values lookup, returning '' when the key is absent or null.
export const val = (
  values: Record<string, unknown> | undefined | null,
  key: string | null | undefined,
): string =>
  (key && values && values[key] != null) ? String(values[key]) : '';
