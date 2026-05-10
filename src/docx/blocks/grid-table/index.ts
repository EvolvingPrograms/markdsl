/**
 * Renders a generic data table with a shaded header row.
 * Column widths are proportional — they are scaled to TABLE_WIDTH at render time.
 */

import { Table, TableRow, Paragraph, WidthType } from 'docx';

import { TABLE_WIDTH, TABLE_BORDERS } from '../../lib/defaults';
import { b, t } from '../../lib/runs';
import { cell } from '../../lib/internal';
import type { GridColumn, GridRow } from './types';

export type { GridColumn, GridRow } from './types';

export const gridTable = ({ columns, rows }: { columns: GridColumn[]; rows: GridRow[] }) => {
  // Scale relative column widths to the fixed TABLE_WIDTH, absorbing rounding into the last column.
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  const factor = TABLE_WIDTH / totalW;
  const widths = columns.map((c) => Math.round(c.width * factor));
  widths[widths.length - 1] = TABLE_WIDTH - widths.slice(0, -1).reduce((s, w) => s + w, 0);

  // keepNext on header cells pins the header row to the next (first data)
  // row — prevents an orphan header at the bottom of a page when the table
  // overflows. Subsequent rows can break across pages normally.
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: columns.map((col, idx) =>
      cell(
        [new Paragraph({ keepNext: true, children: [b(col.label)] })],
        widths[idx]!,
        { header: true },
      ),
    ),
  });

  const dataRows = rows.map((row, rowIdx) =>
    new TableRow({
      cantSplit: true,
      children: columns.map((col, colIdx) => {
        let cellText = '';
        if (col.key === '#') cellText = String(rowIdx + 1);
        else if (row[col.key] != null) cellText = String(row[col.key]);

        return cell(
          [new Paragraph({ children: [t(cellText)] })],
          widths[colIdx]!,
        );
      }),
    }),
  );

  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    borders: TABLE_BORDERS,
    rows: [headerRow, ...dataRows],
  });
};
