// Pandoc block AST -> docx node conversion. Generic — DSL-specific
// fenced blocks arrive via `config.fencedHandlers`.

import { Paragraph, HeadingLevel, AlignmentType } from 'docx';
import { listItem, numberedListItem, nextListInstance, spacer } from './blocks';
import { PARA_SPACING } from './lib/defaults';

import { inlinesToRuns } from './render-inlines';
import type { PandocBlock, PandocInline } from '../pandoc';
import type { DocNode, DocxRenderConfig, RenderCtx } from './types';

export function blockToDocBuilder(
  blk: PandocBlock,
  values: Record<string, unknown>,
  ctx: RenderCtx,
  config: DocxRenderConfig,
): DocNode[] {
  switch (blk.t) {
    case 'Header': {
      const [level, attrs, inlines] = blk.c as [number, [string, string[], unknown[]], PandocInline[]];
      const [, classes] = attrs;
      const pageBreak = classes.includes('pageBreak') || classes.includes('pagebreak');
      const center = classes.includes('center');
      // Pass `font` so each emitted run carries an explicit `w:rFonts` —
      // without it, Word's built-in heading styles fall back to the
      // theme major font in renderers that honor theme references.
      const runs = inlinesToRuns(inlines, { values, schema: ctx.schema, font: ctx.font }, config);
      const headingLevel = level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
      return [new Paragraph({
        heading: headingLevel,
        pageBreakBefore: pageBreak,
        ...(center ? { alignment: AlignmentType.CENTER } : {}),
        children: runs,
      })];
    }

    case 'Para':
    case 'Plain': {
      const runs = inlinesToRuns(blk.c as PandocInline[], { values, schema: ctx.schema }, config);
      const spacing = { ...PARA_SPACING, ...(ctx.paraSpacing ?? {}) };
      if (ctx.indent) {
        // Document-level first-line indent — legal block style.
        return [new Paragraph({
          spacing,
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: ctx.bodyIndent ?? 540 },
          children: runs,
        })];
      }
      // Plain body paragraph — same defaults as `p()` but with overridable
      // spacing.
      return [new Paragraph({
        spacing,
        alignment: AlignmentType.JUSTIFIED,
        children: runs,
      })];
    }

    case 'Div': {
      // ::: {.center}     — center-aligned paragraphs
      // ::: {.indent}     — first-line-indented paragraphs (legal block style:
      //                     "WHEREAS, …" recitals indent at the start of each
      //                     paragraph instead of being separated by subheadings)
      // ::: {.pageBreak}  — start a new page before this Div's content. Use
      //                     for signature pages: drop the "## Signatures"
      //                     heading and just wrap the closing prose so the
      //                     undersigned paragraph + sig tables land on a
      //                     fresh page.
      // ::: {.gap}        — empty Div emits a tall blank paragraph, for vertical
      //                     breathing room (e.g. before "[SIGNATURE PAGE TO
      //                     FOLLOW.]"). When used alongside `{.center}` etc. on
      //                     a non-empty Div, adds extra `before` spacing to
      //                     the first paragraph.
      const [attrs, children] = blk.c as [[string, string[], unknown[]], PandocBlock[]];
      const [, classes] = attrs;
      const center = classes.includes('center');
      const indent = classes.includes('indent');
      const pageBreak = classes.includes('pageBreak') || classes.includes('pagebreak');
      const gap = classes.includes('gap');
      const title = classes.includes('title');

      // ::: {.title} — promote contained paragraph(s) to Heading 1.
      // Pandoc's ATX heading consumes only one line, so a multi-line
      // exhibit/title block isn't authorable as `# foo\nbar`. Wrapping
      // in a `.title` Div lets the author write a single paragraph with
      // hard breaks (`\` at line end) and have it render as one
      // Heading 1 paragraph at H1 size. Combine with `.pageBreak` to
      // start a new page (Heading 1 is centered by default).
      if (title) {
        const out: DocNode[] = [];
        let pageBreakApplied = !pageBreak;
        for (const child of children) {
          if (child.t === 'Para' || child.t === 'Plain') {
            out.push(new Paragraph({
              heading: HeadingLevel.HEADING_1,
              ...(pageBreakApplied ? {} : { pageBreakBefore: true }),
              children: inlinesToRuns(child.c as PandocInline[], { values, schema: ctx.schema, font: ctx.font }, config),
            }));
            pageBreakApplied = true;
          }
        }
        return out;
      }

      // Empty {.gap} — emit a tall blank paragraph (~one line height).
      // Configurable via `style.gap` in front-matter (default 240 twips).
      const gapTwips = ctx.gap ?? 240;
      if (gap && children.length === 0) {
        return [new Paragraph({ spacing: { before: gapTwips, after: gapTwips }, children: [] })];
      }
      // Empty {.pageBreak} — emit a standalone page-break paragraph. Useful
      // as a "break here" mark via the inline form `::: {.pageBreak} :::`.
      if (pageBreak && children.length === 0) {
        return [new Paragraph({ pageBreakBefore: true, children: [] })];
      }
      const out: DocNode[] = [];
      let pageBreakApplied = !pageBreak;
      for (const child of children) {
        const isPara = child.t === 'Para' || child.t === 'Plain';
        // Para/Plain children are reconstructed in-place so we can apply Div
        // attributes (center, indent, pageBreak) directly to the Paragraph.
        if (isPara && (center || indent || gap || !pageBreakApplied)) {
          // Match the default body-paragraph styling (justified, 1.5 line,
          // before/after spacing) so Div paragraphs flow with the same
          // breathing room as plain prose. Center overrides justification.
          // {.gap} adds extra `before` spacing (= 2× style.gap) for vertical
          // breathing room above the first child paragraph.
          const spacing = gap
            ? { ...PARA_SPACING, before: gapTwips * 2 }
            : PARA_SPACING;
          out.push(new Paragraph({
            spacing,
            alignment: center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
            ...(indent ? { indent: { firstLine: ctx.bodyIndent ?? 540 } } : {}),
            ...(!pageBreakApplied ? { pageBreakBefore: true } : {}),
            children: inlinesToRuns(child.c as PandocInline[], { values, schema: ctx.schema }, config),
          }));
          pageBreakApplied = true;
        } else {
          // Non-paragraph child (or Div with no qualifying attribute). For
          // pageBreak-only Divs whose first child is, e.g., a code block,
          // emit an empty page-break paragraph so the break still fires.
          if (!pageBreakApplied) {
            out.push(new Paragraph({ pageBreakBefore: true, children: [] }));
            pageBreakApplied = true;
          }
          out.push(...blockToDocBuilder(child, values, ctx, config));
        }
      }
      return out;
    }

    case 'OrderedList':
    case 'BulletList': {
      // Pandoc OrderedList carries a list-style attribute distinguishing
      // `1. 2. 3.` (Decimal/DefaultStyle) from `a. b. c.` (LowerAlpha) etc.
      // We use it to pick the right numbering format.
      let lowerAlpha = false;
      let items: PandocBlock[][];
      if (blk.t === 'OrderedList') {
        const [attrs, listItems] = blk.c as [
          [number, { t: string }, { t: string }],
          PandocBlock[][],
        ];
        lowerAlpha = attrs[1]?.t === 'LowerAlpha';
        items = listItems;
      } else {
        items = blk.c as PandocBlock[][];
      }
      const isNumbered = blk.t === 'OrderedList' && !lowerAlpha;
      // One numbering instance for the whole list — shared across items so
      // they render as a single continuous (1)(2)(3) sequence. Trailing
      // blocks inside an item (nested lists, code blocks) emit between
      // items but use their own instances.
      const instance = nextListInstance();
      const makeItem = isNumbered ? numberedListItem : listItem;
      const out: DocNode[] = [];
      for (const itemBlocks of items) {
        const itemInlines: PandocInline[] = [];
        const trailingBlocks: PandocBlock[] = [];
        let textTaken = false;
        for (const ib of itemBlocks) {
          if (!textTaken && (ib.t === 'Plain' || ib.t === 'Para')) {
            itemInlines.push(...(ib.c as PandocInline[]));
            textTaken = true;
          } else {
            trailingBlocks.push(ib);
          }
        }
        const runs = inlinesToRuns(itemInlines, { values, schema: ctx.schema }, config);
        out.push(makeItem(runs, instance));
        for (const tb of trailingBlocks) {
          out.push(...blockToDocBuilder(tb, values, ctx, config));
        }
      }
      return out;
    }

    case 'CodeBlock': {
      const [attrs, content] = blk.c as [[string, string[], unknown[]], string];
      const [, classes] = attrs;
      const lang = classes[0];
      if (!lang) return [];
      const handler = config.fencedHandlers?.[lang];
      if (handler) return handler(content, values, ctx);
      console.warn('Unknown fenced block:', lang);
      return [];
    }

    case 'HorizontalRule':
      return [spacer()];

    case 'BlockQuote':
    case 'DefinitionList':
    case 'Table':
    case 'RawBlock':
    case 'Null':
      return [];

    default:
      console.warn('Unhandled block type:', blk.t);
      return [];
  }
}
