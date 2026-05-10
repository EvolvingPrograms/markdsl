/**
 * Compose and write a .docx file from a title and body entries.
 * House styles (fonts, headings, numbering) are applied here so callers
 * never need to think about them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, AlignmentType, LevelFormat,
  Footer, Paragraph as DocxParagraph, TextRun, PageNumber, SectionType,
} from 'docx';
import type { Paragraph, Table } from 'docx';

// `import.meta.dir` is bun-only — undefined in Node and after `bun build
// --target=node`. Use the universal ESM idiom so the bundled dist/ runs
// under Node too.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
  FONT, BODY_SIZE, H1_SIZE, H2_SIZE,
  PAGE, MARGIN, PARA_SPACING, SUBLIST_REF, TOPLIST_REF,
} from './defaults';
import { h1 } from '../blocks';
import type { BodyEntry } from '../types';
import { sanitizeFontFilenames } from './sanitize-fonts';

/** Per-document style overrides — front-matter `style:` block. All fields
 *  optional; missing fields fall back to house defaults. */
export interface DocStyleOpts {
  font?: string;
  size?: number;     // body font size in points (12 = 12pt)
  h1_size?: number;
  h2_size?: number;
  margin?: number | { top?: number; right?: number; bottom?: number; left?: number };
  spacing?: { before?: number; after?: number; line?: number };
  list?: {
    indent?: number;
    sub_indent?: number;
    sub_hanging?: number;
    bold_marker?: boolean;
  };
  body?: { indent?: number };
  title?: { alignment?: 'left' | 'center' | 'right' | 'justified' };
  columns?: number | {
    count: number;
    space?: number;
    separate?: boolean;
    equalWidth?: boolean;
  };
}

/** Bundled font families (Google Fonts under OFL/Apache). Read from
 *  fonts/manifest.json at module load. The font binaries get embedded into
 *  the .docx so the document renders correctly even on systems where the
 *  font isn't installed. Resolves relative to the source file at runtime.
 *  Looks for `fonts/` first in the install directory, then in the parent
 *  (handles both `node $SKILL_DIR <doc>` and library/installed-package use). */
function loadFontManifest(): { family: string; name: string; data: Buffer }[] {
  // Walk up from this file to find a fonts/ directory.
  const candidates = [
    path.resolve(__dirname, '..', 'fonts'),         // src/lib → fonts/
    path.resolve(__dirname, '..', '..', 'fonts'),   // dist/ → fonts/
    path.resolve(process.cwd(), 'fonts'),           // CWD-relative
  ];

  for (const dir of candidates) {
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    const out: { family: string; name: string; data: Buffer }[] = [];
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      family: string; files: string[];
    }[];

    for (const fam of manifest) {
      for (const file of fam.files) {
        const tt = path.join(dir, file);
        if (fs.existsSync(tt)) {
          // docx FontOptions wants `name` for the family string. We keep
          // a separate `family` field for our own filter (every variant
          // shares one family but each variant is one entry).
          out.push({ family: fam.family, name: fam.family, data: fs.readFileSync(tt) });
        }
      }
    }
    return out;
  }
  return [];
}

const BUNDLED_FONTS = loadFontManifest();

/** Resolve margin spec into a 4-sided object. */
function resolveMargin(spec: DocStyleOpts['margin']): { top: number; right: number; bottom: number; left: number } {
  if (typeof spec === 'number') {
    return { top: spec, right: spec, bottom: spec, left: spec };
  }
  return {
    top:    spec?.top    ?? MARGIN.top,
    right:  spec?.right  ?? MARGIN.right,
    bottom: spec?.bottom ?? MARGIN.bottom,
    left:   spec?.left   ?? MARGIN.left,
  };
}

/** Resolve column spec into the docx-js column attributes object, or
 *  `undefined` when no multi-column layout is requested. Accepts either
 *  a bare count (`columns: 2`) or a detailed config object. */
function resolveColumns(spec: DocStyleOpts['columns']):
  | { count: number; space?: number; separate?: boolean; equalWidth?: boolean }
  | undefined {
  if (spec === undefined) return undefined;
  if (typeof spec === 'number') {
    if (spec < 2) return undefined;
    return { count: spec, space: 720, equalWidth: true };
  }
  return {
    count: spec.count,
    space: spec.space ?? 720,
    ...(spec.separate !== undefined ? { separate: spec.separate } : {}),
    equalWidth: spec.equalWidth ?? true,
  };
}

export interface BuildArgs {
  title?: string;
  body: BodyEntry[];
  /** Additional content that lands in section 1 (above the column split)
   *  alongside the title. Used by `::: {.header}` Divs in markdown to
   *  put author / affiliation / date in the spanning header of an
   *  academic-paper layout. Single-column docs see no visible difference. */
  headerBody?: BodyEntry[];
  style?: DocStyleOpts | Record<string, unknown>;
}

/** Compose the Document object — shared by `buildToBuffer` (pure, returns
 *  bytes) and `build` (writes to disk). Splitting them out lets browser
 *  callers consume `buildToBuffer` without pulling in `node:fs`. */
const composeDocument = ({ title, body, headerBody, style }: BuildArgs) => {
  const s  = (style ?? {}) as DocStyleOpts;
  const ls = s.list ?? {};
  const sp = s.spacing ?? {};

  // Font sizes: docx uses half-points (24 = 12pt). User input is in points.
  const FONT_FAMILY = s.font ?? FONT;
  const SIZE  = s.size    ? s.size    * 2 : BODY_SIZE;
  const H1_SZ = s.h1_size ? s.h1_size * 2 : H1_SIZE;
  const H2_SZ = s.h2_size ? s.h2_size * 2 : H2_SIZE;

  const PARA_BEFORE = sp.before  ?? PARA_SPACING.before;
  const PARA_AFTER  = sp.after   ?? PARA_SPACING.after;
  const PARA_LINE   = sp.line    ?? PARA_SPACING.line;

  const MARGINS = resolveMargin(s.margin);
  const COLUMNS = resolveColumns(s.columns);
  const TITLE_ALIGN = ({
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justified: AlignmentType.JUSTIFIED,
  } as const)[s.title?.alignment ?? 'center'];

  // If the requested font is one of our bundled families, embed it in the
  // .docx so the document renders correctly on systems without the font
  // installed. Word may show a "Word found unreadable content" recovery
  // prompt on open (docx-js's font-embedding emits fixed `<w:sig>` values
  // that don't match the font's actual OS/2 table); accepting the prompt
  // recovers the file cleanly. We embed only ONE file per family (the
  // regular variant) because docx-js's FontOptions API doesn't expose
  // variant flags — passing multiple files with the same name produces
  // duplicate <w:font> entries that confuse Word. Bold/italic are
  // synthesized.
  const embeddedFonts = s.font
    ? BUNDLED_FONTS
        .filter((f) => f.family === s.font)
        .slice(0, 1)
        .map(({ name, data }) => ({ name, data }))
    : [];

  const TOP_INDENT = ls.indent      ?? 540;
  const SUB_INDENT = ls.sub_indent  ?? 900;
  const SUB_HANG   = ls.sub_hanging ?? 360;
  const BOLD_NUM   = ls.bold_marker ?? true;
  const doc = new Document({
    ...(embeddedFonts.length > 0 ? { fonts: embeddedFonts } : {}),
    styles: {
      default: {
        // Default paragraph spacing is tight (single line, no before/after) —
        // appropriate for table cells. Body paragraphs and list items
        // override explicitly with their own spacing in the block builders.
        // Without this, cells inherit Word's "modern" Normal defaults
        // (~8pt after, 1.08 line) and field-table rows balloon.
        document: {
          run: { font: FONT_FAMILY, size: SIZE },
          paragraph: { spacing: { before: 0, after: 0, line: 240 } },
        },
        // Override Word's built-in Heading 1 / Heading 2 styles. docx-js
        // ignores `paragraphStyles[]` entries with these reserved IDs;
        // the `default.heading1` / `default.heading2` slots are how you
        // actually replace the built-ins. Without this, Word applies its
        // own Quick Style spacing (notably a 1.5×-ish line height) which
        // leaves visible padding inside the heading paragraph below the
        // text, regardless of what we set elsewhere.
        heading1: {
          run: { size: H1_SZ, bold: true, font: FONT_FAMILY },
          paragraph: {
            spacing: { before: 240, after: 360, line: 240 },
            alignment: TITLE_ALIGN,
          },
        },
        heading2: {
          run: { size: H2_SZ, bold: true, font: FONT_FAMILY },
          paragraph: {
            spacing: { before: 280, after: 120, line: 240 },
          },
        },
      },
    },
    numbering: {
      config: [
        {
          // Lettered sub-list under a numbered top-level item.
          reference: SUBLIST_REF,
          levels: [{
            level: 0,
            format: LevelFormat.LOWER_LETTER,
            text: '(%1)',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: SUB_INDENT, hanging: SUB_HANG } } },
          }],
        },
        {
          // Top-level numbered sections: 1.   2.   3.
          reference: TOPLIST_REF,
          levels: [{
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: {
              ...(BOLD_NUM ? { run: { bold: true } } : {}),
              paragraph: { indent: { left: TOP_INDENT, hanging: TOP_INDENT } },
            },
          }],
        },
      ],
    },
    // Two sections — title in section 1 (always 1-column), body in
    // section 2 (configured columns). When body uses multi-column
    // layout, this gives the title a spanning-header look like academic
    // journals. With single-column body, the visual is identical to one
    // section. The "continuous" section break on section 2 means no
    // page break between title and body.
    sections: title ? [
      {
        properties: {
          page: { size: PAGE, margin: MARGINS },
          titlePage: false,
        },
        footers: {
          default: new Footer({
            children: [new DocxParagraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: [PageNumber.CURRENT] })],
            })],
          }),
        },
        children: [
          h1(title, { font: FONT_FAMILY, size: H1_SZ }),
          ...(headerBody
            ? ((headerBody as unknown[]).flat(Infinity) as (Paragraph | Table)[])
            : []),
        ],
      },
      {
        properties: {
          page: { size: PAGE, margin: MARGINS },
          titlePage: false,
          type: SectionType.CONTINUOUS,
          ...(COLUMNS ? { column: COLUMNS } : {}),
        },
        footers: {
          default: new Footer({
            children: [new DocxParagraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: [PageNumber.CURRENT] })],
            })],
          }),
        },
        children: [
          // Cast through unknown[] before re-casting: TS2589 bails on deeply
          // recursive BodyEntry[] when flat(Infinity) is typed directly.
          ...((body as unknown[]).flat(Infinity) as (Paragraph | Table)[]),
        ],
      },
    ] : headerBody && headerBody.length ? [
      // No title but explicit header content present — split into the
      // same two-section shape so the header still spans columns.
      {
        properties: {
          page: { size: PAGE, margin: MARGINS },
          titlePage: false,
        },
        footers: {
          default: new Footer({
            children: [new DocxParagraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: [PageNumber.CURRENT] })],
            })],
          }),
        },
        children: ((headerBody as unknown[]).flat(Infinity) as (Paragraph | Table)[]),
      },
      {
        properties: {
          page: { size: PAGE, margin: MARGINS },
          titlePage: false,
          type: SectionType.CONTINUOUS,
          ...(COLUMNS ? { column: COLUMNS } : {}),
        },
        footers: {
          default: new Footer({
            children: [new DocxParagraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: [PageNumber.CURRENT] })],
            })],
          }),
        },
        children: [
          ...((body as unknown[]).flat(Infinity) as (Paragraph | Table)[]),
        ],
      },
    ] : [
      // No title, no header — single section with the body.
      {
        properties: {
          page: { size: PAGE, margin: MARGINS },
          titlePage: false,
          ...(COLUMNS ? { column: COLUMNS } : {}),
        },
        footers: {
          default: new Footer({
            children: [new DocxParagraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: [PageNumber.CURRENT] })],
            })],
          }),
        },
        children: [
          ...((body as unknown[]).flat(Infinity) as (Paragraph | Table)[]),
        ],
      },
    ],
  });

  return doc;
};

/** Compose `body` into a .docx and return the raw bytes — no filesystem
 *  involvement. Use this in the browser, in serverless handlers that
 *  return a Response, or anywhere you'd rather hold the document in
 *  memory than land it on disk. */
export const buildToBuffer = async (args: BuildArgs): Promise<Buffer> => {
  const doc = composeDocument(args);
  const buf = await Packer.toBuffer(doc);
  // Post-process: rename embedded font zip entries to filename-safe
  // sequence numbers. No-op when no fonts are embedded.
  return sanitizeFontFilenames(buf);
};

/** Write `body` (flat or nested) to `output` as a .docx; resolves to the output path. */
export const build = ({ output, ...rest }: BuildArgs & { output: string }): Promise<string> => {
  return buildToBuffer(rest).then((buffer) => {
    fs.writeFileSync(output, buffer);
    return output;
  });
};
