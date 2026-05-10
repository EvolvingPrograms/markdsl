/**
 * Renders a signature block table. Supports two layouts:
 *   - Single-sided (right is undefined): one header spanning two columns at full width.
 *   - Two-sided: two headers, four columns, sides padded to equal row count.
 */

import { Table, TableRow, Paragraph, AlignmentType, WidthType, HeightRule } from 'docx';

import { TABLE_WIDTH, TABLE_BORDERS, SIG_TALL } from '../../lib/defaults';
import { b, t } from '../../lib/runs';
import { cell, val } from '../../lib/internal';

import type { SigRow, SigSide } from './types';
export * from './types';

/** Normalise the sparse tuple form into a consistent object. */
const normRow = (row: SigRow) => {
  const [label = '', key = null, opts = {}] = row;
  return { label, key, opts };
};

export const signatureTable = (
  values: Record<string, unknown>,
  { left, right }: { left: SigSide; right?: SigSide },
) => {
  // --- Single-sided layout ---
  // One merged header cell, label column + value column at full table width.
  if (!right) {
    const LABEL_W = 3000;
    const VALUE_W = 6360;

    const rows = left.rows.map(normRow);
    // Sig blocks are atomic — keepNext on every row except the last pins the
    // whole table together so it never splits across a page break.
    const lastIdx = rows.length;  // header is row 0, data rows 1..N

    return new Table({
      width: { size: TABLE_WIDTH, type: WidthType.DXA },
      columnWidths: [LABEL_W, VALUE_W],
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cell(
              [new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, children: [b(left.header)] })],
              LABEL_W + VALUE_W,
              { columnSpan: 2, header: true },
            ),
          ],
        }),
        ...rows.map((R, idx) => {
          const pinNext = idx + 1 < lastIdx;
          return new TableRow({
            cantSplit: true,
            ...(R.opts.tall ? { height: { value: SIG_TALL, rule: HeightRule.ATLEAST } } : {}),
            children: [
              cell([new Paragraph({ ...(pinNext ? { keepNext: true } : {}), children: [b(R.label)] })], LABEL_W, { header: true }),
              cell([new Paragraph({ ...(pinNext ? { keepNext: true } : {}), children: [t(val(values, R.key))] })], VALUE_W),
            ],
          });
        }),
      ],
    });
  }

  // --- Two-sided layout ---
  // Five columns: label | value | gutter | label | value. The gutter is a
  // borderless gap (~240 twips) so the two halves visually breathe apart
  // instead of sharing a border.
  const GUTTER_W = 240;
  const SIDE_W = (TABLE_WIDTH - GUTTER_W) / 2;
  const LABEL_W = Math.round(SIDE_W * 0.32);
  const VALUE_W = Math.round(SIDE_W) - LABEL_W;

  const sigVal = (key: string | null) =>
    cell(
      [new Paragraph({ children: [t(val(values, key))] })],
      VALUE_W,
    );

  const maxRows = Math.max(left.rows.length, right.rows.length);
  const pad = (rows: SigRow[]) => {
    const out: SigRow[] = rows.slice();
    while (out.length < maxRows) out.push(['', null]);
    return out.map(normRow);
  };

  const lrows = pad(left.rows);
  const rrows = pad(right.rows);

  // keepNext pins each row to the next so the whole sig block stays on one
  // page. lastIdx is the count of data rows; header is row 0, data rows 1..N.
  const lastIdx = lrows.length;

  const gutter = (kn: object) =>
    cell([new Paragraph({ ...kn, children: [t('')] })], GUTTER_W, { borders: 'none' });

  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [LABEL_W, VALUE_W, GUTTER_W, LABEL_W, VALUE_W],
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, children: [b(left.header)] })],
            LABEL_W + VALUE_W,
            { columnSpan: 2, header: true },
          ),
          gutter({ keepNext: true }),
          cell(
            [new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, children: [b(right.header)] })],
            LABEL_W + VALUE_W,
            { columnSpan: 2, header: true },
          ),
        ],
      }),
      ...lrows.map((L, idx) => {
        const R = rrows[idx]!;
        const tall = L.opts.tall || R.opts.tall;
        const pinNext = idx + 1 < lastIdx;
        const kn = pinNext ? { keepNext: true } : {};

        return new TableRow({
          cantSplit: true,
          ...(tall ? { height: { value: SIG_TALL, rule: HeightRule.ATLEAST } } : {}),
          children: [
            cell([new Paragraph({ ...kn, children: [b(L.label)] })], LABEL_W, { header: true }),
            cell([new Paragraph({ ...kn, children: [t(val(values, L.key))] })], VALUE_W),
            gutter(kn),
            cell([new Paragraph({ ...kn, children: [b(R.label)] })], LABEL_W, { header: true }),
            cell([new Paragraph({ ...kn, children: [t(val(values, R.key))] })], VALUE_W),
          ],
        });
      }),
    ],
  });
};
