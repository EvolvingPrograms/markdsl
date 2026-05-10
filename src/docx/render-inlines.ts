// Pandoc inline AST -> docx TextRun[] conversion. Generic — DSL-specific
// `{{...}}` marker emission arrives via `config.markerEmitter`.
//
// Pandoc inline node coverage:
//   Str / Space / SoftBreak  → flatten + scan for `{{...}}` markers
//   LineBreak                → hard break (`<w:br/>`)
//   Strong / Emph / Underline / Strikeout → recurse with style toggled
//   Quoted                   → wrap with curly quotes
//   Code                     → plain TextRun (no monospace styling here)
//   Span                     → built-in `.underline` / `.smallcaps`;
//                              other classes dispatch to
//                              `config.spanHandlers[class]`
//   Math                     → italic TeX in a TextRun (default).
//                              DSLs with real equation rendering wrap
//                              the renderer or post-process.
//   Note / Cite / Image / Link / RawInline: ignored

import { TextRun } from 'docx';

import type { PandocInline } from '../pandoc';
import type { Schema } from '../schema';
import type { DocxRenderConfig, MarkerEmitter } from './types';

type Run = TextRun;

interface MarkerCtx {
  values: Record<string, unknown>;
  schema: Schema | undefined;
}

// Only set bold/italic/etc. when true so heading-style bold isn't overridden.
function makeRun(
  text: string,
  bold: boolean,
  italic: boolean,
  smallCaps = false,
  underline = false,
  font?: string,
): Run {
  return new TextRun({
    text,
    ...(bold      ? { bold: true }      : {}),
    ...(italic    ? { italics: true }   : {}),
    ...(smallCaps ? { smallCaps: true } : {}),
    ...(underline ? { underline: {} }   : {}),
    ...(font      ? { font }            : {}),
  });
}

/** Default marker emitter — passes the marker text through verbatim
 *  (`{{...}}` → `{{...}}`). Renders something visible if a DSL hasn't
 *  registered its own emitter, instead of silently swallowing markers. */
const passThroughMarker: MarkerEmitter = (inner, bold, italic, out) => {
  out.push(makeRun(`{{${inner}}}`, bold, italic));
};

// Scan plain text for `{{...}}` markers, emitting runs for both the
// surrounding text and each marker via the configured emitter.
// `underline` applies only to the surrounding text; markers render in
// their own styling. `font`, when set, lands on every non-marker run.
function emitText(
  text: string,
  bold: boolean,
  italic: boolean,
  out: Run[],
  ctx: MarkerCtx,
  emitter: MarkerEmitter,
  smallCaps = false,
  underline = false,
  font?: string,
): void {
  const re = /\{\{([^}]+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(makeRun(text.slice(last, m.index), bold, italic, smallCaps, underline, font));
    }
    last = m.index + m[0].length;
    const inner = (m[1] ?? '').trim();
    emitter(inner, bold, italic, out, ctx, text[last]);
  }

  if (last < text.length) {
    out.push(makeRun(text.slice(last), bold, italic, smallCaps, underline, font));
  }
}

// Flatten consecutive Str/Space/SoftBreak nodes into a single text
// string so `{{Multi Word Term}}` markers that pandoc split across
// tokens reassemble before the regex scan. LineBreak is NOT absorbed
// — it represents a hard break (markdown `\` or two trailing spaces)
// and emits a real `<w:br/>` downstream.
function gatherText(inlines: PandocInline[], start: number): { text: string; end: number } {
  let text = '';
  let i = start;

  while (i < inlines.length) {
    const n = inlines[i]!;
    if      (n.t === 'Str')                              text += n.c as string;
    else if (n.t === 'Space' || n.t === 'SoftBreak')     text += ' ';
    else break;
    i++;
  }

  return { text, end: i };
}

/** Convert a Pandoc inline node array into an array of docx TextRuns.
 *  Generic — DSL marker grammar arrives via `config.markerEmitter`,
 *  Span class extensions via `config.spanHandlers`. */
export function inlinesToRuns(
  inlines: PandocInline[],
  opts: {
    bold?: boolean; italic?: boolean; underline?: boolean; smallCaps?: boolean;
    /** Explicit font on each emitted run. Headings set this so the
     *  `w:rFonts` lands on the run, not just on the style — Word's
     *  theme-major-font inheritance otherwise wins for built-in
     *  Heading 1 / Heading 2 styles in some renderers. */
    font?: string;
    values?: Record<string, unknown>; schema?: Schema;
  } = {},
  config: DocxRenderConfig = {},
): Run[] {
  const { bold = false, italic = false, underline = false, smallCaps = false, font, values = {}, schema } = opts;
  // Normalized style/context bag — every recursive call spreads this
  // and overrides only what changes. Keeps the call sites short and
  // makes "what's different here" obvious.
  const style = { bold, italic, underline, smallCaps, font, values, schema };
  const ctx: MarkerCtx = { values, schema };
  const emitter = config.markerEmitter ?? passThroughMarker;
  const out: Run[] = [];

  for (let i = 0; i < inlines.length; i++) {
    const node = inlines[i]!;

    switch (node.t) {
      case 'Str':
      case 'Space':
      case 'SoftBreak': {
        const { text, end } = gatherText(inlines, i);
        emitText(text, bold, italic, out, ctx, emitter, smallCaps, underline, font);
        i = end - 1;
        break;
      }

      case 'LineBreak':
        // Markdown hard break (`\` at line end or two trailing spaces) →
        // emit `<w:br/>` so the next text starts on a fresh line within
        // the same paragraph. Without this, pandoc's LineBreak nodes
        // collapse into spaces and a multi-line title block runs together.
        out.push(new TextRun({
          break: 1,
          ...(font ? { font } : {}),
        }));
        break;

      case 'Strong':
        out.push(...inlinesToRuns(node.c as PandocInline[], { ...style, bold: true }, config));
        break;

      case 'Emph':
        out.push(...inlinesToRuns(node.c as PandocInline[], { ...style, italic: true }, config));
        break;

      case 'Underline':
        // Pandoc emits this for `[text]{.underline}` (with +bracketed_spans,
        // which we enable). Standard idiom for underlined exhibit/schedule
        // headings: `[EXHIBIT A]{.underline}`.
        out.push(...inlinesToRuns(node.c as PandocInline[], { ...style, underline: true }, config));
        break;

      case 'Strikeout':
        out.push(...inlinesToRuns(node.c as PandocInline[], style, config));
        break;

      case 'SmallCaps':
        // Pandoc emits SmallCaps directly for `[text]{.smallcaps}` —
        // recurse with the smallCaps flag set; every leaf run picks
        // it up via makeRun.
        out.push(...inlinesToRuns(node.c as PandocInline[], { ...style, smallCaps: true }, config));
        break;

      case 'Quoted': {
        const [quoteType, contents] = node.c as [{ t: string }, PandocInline[]];
        const open  = quoteType.t === 'DoubleQuote' ? '“' : '‘';
        const close = quoteType.t === 'DoubleQuote' ? '”' : '’';
        out.push(makeRun(open, bold, italic, smallCaps, underline, font));
        out.push(...inlinesToRuns(contents, style, config));
        out.push(makeRun(close, bold, italic, smallCaps, underline, font));
        break;
      }

      case 'Code': {
        const [, text] = node.c as [unknown, string];
        out.push(makeRun(text, bold, italic, smallCaps, underline, font));
        break;
      }

      case 'Math': {
        // Pandoc's Math inline: c = [{ t: 'InlineMath' | 'DisplayMath' }, '<tex>'].
        // Default rendering: italic TeX string in a TextRun. Cheap and
        // legible — readers see the source equation. DSLs that want
        // proper OMML wrap or post-process the renderer.
        const [, tex] = node.c as [{ t: string }, string];
        out.push(makeRun(tex, bold, true, smallCaps, underline, font));
        break;
      }

      case 'Span': {
        // [text]{.smallcaps} or [text]{.underline} — pandoc emits these as
        // Span with the class in the attribute list. The renderer handles
        // .underline + .smallcaps natively (universal idioms); other
        // classes dispatch to config.spanHandlers.
        const [attrs, contents] = node.c as [[string, string[], unknown[]], PandocInline[]];
        const classes = attrs[1] ?? [];
        if (classes.includes('underline')) {
          out.push(...inlinesToRuns(contents, { ...style, underline: true }, config));
          break;
        }
        if (classes.includes('smallcaps')) {
          // Recurse with smallCaps flag set — every leaf run will pick
          // up `smallCaps: true` via makeRun.
          out.push(...inlinesToRuns(contents, { ...style, smallCaps: true }, config));
          break;
        }
        const handler = classes.length ? config.spanHandlers?.[classes[0]!] : undefined;
        if (handler) {
          const inner = inlinesToRuns(contents, style, config);
          out.push(...handler(inner, { bold, italic, underline, font }));
        } else {
          out.push(...inlinesToRuns(contents, style, config));
        }
        break;
      }

      case 'Link': {
        // Pandoc Link: c = [attrs, contents: PandocInline[], [url, title]].
        // Render the link text only — embedding clickable hyperlinks in
        // docx requires building per-run external relationships, which
        // is more machinery than the common citation/cross-ref use case
        // warrants. Consumers that need real hyperlinks register a
        // span handler on a `.hyperlink` class or post-process.
        const [, linkContents] = node.c as [unknown, PandocInline[], unknown];
        out.push(...inlinesToRuns(linkContents, style, config));
        break;
      }

      case 'Cite': {
        // Pandoc Cite: c = [citations[], inlines: PandocInline[]].
        // The inlines are the source bracketed form (`[@key]`); when
        // pandoc was invoked with --citeproc those inlines have
        // already been replaced with the resolved citation prose
        // (e.g. "(Kour and Saabne 2014)"). Without citeproc they
        // round-trip the literal `[@key]` text — visible-by-default
        // is the right behavior for partial setups.
        const [, citeContents] = node.c as [unknown, PandocInline[]];
        out.push(...inlinesToRuns(citeContents, style, config));
        break;
      }

      // Note, Image, RawInline: ignored.
    }
  }

  return out;
}
