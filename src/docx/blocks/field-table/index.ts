// Two-column "Label | Value" table with full grid borders.

import { Paragraph, Table, TableRow, TextRun, WidthType } from 'docx';

import { TABLE_BORDERS, TABLE_WIDTH } from '../../lib/defaults';
import { cell, val } from '../../lib/internal';
import { b, t } from '../../lib/runs';

import type { FieldRow } from './types';
export * from './types';

/** Renders a two-column field table where each row shows a bold label and a
 *  looked-up value. Rows may be tuples or objects; see FieldRow. */
export const fieldTable = (values: Record<string, unknown>, rows: FieldRow[]) => {
  const LABEL_W = 2800;
  const VALUE_W = TABLE_WIDTH - LABEL_W;

  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [LABEL_W, VALUE_W],
    borders: TABLE_BORDERS,
    rows: rows.map((row) => {
      let label: string;
      let key: string | null;
      let prefix: string | undefined;
      let subLabel: string | undefined;

      if (Array.isArray(row)) {
        [label, key] = row;
        const opts = row[2] ?? {};
        prefix = opts.prefix;
        subLabel = opts.subLabel;
      } else {
        ({ label, key, prefix, subLabel } = row);
      }

      const cellText = (prefix ?? '') + val(values, key);
      const labelChildren = [
        new Paragraph({ children: [b(label)] }),
        ...(subLabel ? [new Paragraph({
          spacing: { before: 40 },
          children: [new TextRun({ text: subLabel, italics: true, size: 20 })],
        })] : []),
      ];

      return new TableRow({
        cantSplit: true,
        children: [
          cell(labelChildren, LABEL_W, { header: true }),
          cell([new Paragraph({ children: [t(cellText)] })], VALUE_W),
        ],
      });
    }),
  });
};
