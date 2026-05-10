// Block-level helpers — return Paragraph or Paragraph[] for use in build().

import { AlignmentType, HeadingLevel, Paragraph, TextRun } from 'docx';

import { PARA_SPACING, LIST_SPACING, SUBLIST_REF, TOPLIST_REF } from '../../lib/defaults';
import { asRun, t } from '../../lib/runs';
import type { RunChild } from '../../lib/runs';

export type ParaChild = RunChild | RunChild[];

/** Justified body paragraph, 12pt, 1.5 line spacing.
 *  Children may be strings, TextRuns, or arrays of either (dt() returns an array). */
export const p = (...children: ParaChild[]) => new Paragraph({
  spacing: PARA_SPACING,
  alignment: AlignmentType.JUSTIFIED,
  children: children.flat().map(asRun),
});

/** Centered title. Multi-line via "\n" — each line emits as a soft break
 *  inside one Heading 1 paragraph so vertical spacing stays tight (rather
 *  than emitting one heading per line, which would over-pad). */
export const h1 = (text: string, opts: { pageBreak?: boolean; font?: string; size?: number } = {}) => {
  const lines = text.split('\n');
  // Explicit run-level font/size defeats theme inheritance — Word's
  // built-in Heading 1 references theme major font + theme size, and
  // some renderers (notably DocuSign and certain Word configs) honor
  // those over our paragraph-style overrides. Setting `font`/`size`
  // on each TextRun emits explicit `w:ascii`/`w:sz` that any conformant
  // renderer must respect.
  const runOpts: { font?: string; size?: number } = {
    ...(opts.font ? { font: opts.font } : {}),
    ...(opts.size ? { size: opts.size } : {}),
  };
  const children: TextRun[] = [];
  lines.forEach((line, i) => {
    if (i > 0) children.push(new TextRun({ break: 1, ...runOpts }));
    children.push(new TextRun({ text: line, ...runOpts }));
  });
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: !!opts.pageBreak,
    children,
  });
};

/** Section heading, kept with the following paragraph. */
export const h2 = (text: string, opts: { pageBreak?: boolean } = {}) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  pageBreakBefore: !!opts.pageBreak,
  children: [t(text)],
});

// Each list gets its own numbering instance so the counter restarts per
// list — legal-doc convention. Without this, all paragraphs sharing the
// same numbering reference would render as one continuous list across the
// doc. Callers that interleave list items with non-list blocks (e.g. nested
// lists) call `nextListInstance()` once and pass the result to each
// `listItem()` / `numberedListItem()` call.
let listInstanceCounter = 0;
export const nextListInstance = () => listInstanceCounter++;

/** Single lettered (a)(b)(c) list-item paragraph using the given instance. */
export const listItem = (runs: ParaChild, instance: number) => {
  const children = (Array.isArray(runs) ? runs : [runs]).flat().map(asRun);
  return new Paragraph({
    numbering: { reference: SUBLIST_REF, level: 0, instance },
    spacing: LIST_SPACING,
    alignment: AlignmentType.JUSTIFIED,
    children,
  });
};

/** Single decimal-numbered (1.)(2.)(3.) list-item paragraph using the given
 *  instance. Hanging indent so wrapped body lines align with body text. */
export const numberedListItem = (runs: ParaChild, instance: number) => {
  const children = (Array.isArray(runs) ? runs : [runs]).flat().map(asRun);
  return new Paragraph({
    numbering: { reference: TOPLIST_REF, level: 0, instance },
    spacing: PARA_SPACING,
    alignment: AlignmentType.JUSTIFIED,
    children,
  });
};

/** Lowercase-lettered sublist — (a) (b) (c) …
 *  Each item is a string or an array of children. Returns an array of Paragraphs;
 *  build() flattens automatically. */
export const list = (...items: ParaChild[]) => {
  const instance = nextListInstance();
  return items.map((item) => listItem(item, instance));
};

/** Top-level numbered list — 1. 2. 3. … with hanging indent so wrapped body
 *  lines align with the body text, not the number. Used for legal-doc section
 *  layouts where each section is a numbered item with a bold lead-in title. */
export const numberedList = (...items: ParaChild[]) => {
  const instance = nextListInstance();
  return items.map((item) => numberedListItem(item, instance));
};

/** Blank line for vertical breathing room. */
export const spacer = () => new Paragraph({
  spacing: { before: 80, after: 80 },
  children: [t('')],
});

/** Escape hatch: pass through any docx Paragraph or Table you built yourself. */
export const raw = <T>(node: T): T => node;
