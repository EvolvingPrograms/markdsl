/**
 * Borderless 2-column "panel" — useful for execution blocks, notarization
 * panels, courtesy-copy address blocks. Pads the shorter side with empty
 * cells so the columns stay row-aligned.
 *
 * Each side accepts an array of strings; markers are resolved upstream
 * (in the fenced-block parser) before reaching here. Leave the `right:`
 * (or `left:`) array off to render a single column.
 */

import { Table, TableRow, Paragraph, BorderStyle, WidthType } from 'docx';
import { TABLE_WIDTH } from '../../lib/defaults';
import { cell } from '../../lib/internal';
import { t } from '../../lib/runs';

const NO_BORDERS = {
  top:              { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom:           { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:             { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:            { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

/** Build a borderless cell containing a left-aligned paragraph. Empty
 *  strings become empty cells so the column stays visually present and
 *  preserves row alignment. */
function panelCell(text: string, width: number) {
  const c = cell(
    [new Paragraph({ children: text ? [t(text)] : [] })],
    width,
    { borders: 'none' },
  );
  return c;
}

export const panelTable = ({
  left,
  right,
}: {
  left?: string[];
  right?: string[];
}): Table => {
  const leftRows = left ?? [];
  const rightRows = right ?? [];
  const twoCol = leftRows.length > 0 && rightRows.length > 0;
  const rowCount = Math.max(leftRows.length, rightRows.length);

  const COL_W = twoCol ? Math.floor(TABLE_WIDTH / 2) : TABLE_WIDTH;
  const onlyLeft = leftRows.length > 0 && rightRows.length === 0;
  const single = onlyLeft ? leftRows : rightRows;

  const rows: TableRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    if (twoCol) {
      rows.push(new TableRow({
        children: [
          panelCell(leftRows[i] ?? '', COL_W),
          panelCell(rightRows[i] ?? '', COL_W),
        ],
      }));
    } else {
      rows.push(new TableRow({
        children: [panelCell(single[i] ?? '', COL_W)],
      }));
    }
  }

  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    borders: NO_BORDERS,
    rows,
  });
};
