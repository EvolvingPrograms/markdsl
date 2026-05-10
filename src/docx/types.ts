// Cross-cutting public types for the docx renderer. Generic — no DSL
// vocabulary leaks through here; DSL-specific blocks/markers/spans
// arrive via the handler maps on DocxRenderConfig.

import type { Paragraph, Table, TextRun } from 'docx';

import type { Schema, FrontMatter as MarkdslFrontMatter } from '../schema';

/** The union of everything docx accepts as a section child, including nested arrays. */
export type BodyEntry = Paragraph | Table | BodyEntry[];

/** Single docx node emitted by a block-level handler. Same union as
 *  `BodyEntry` minus the nesting — handlers return a flat list. */
export type DocNode = Paragraph | Table;

/** Context threaded through block / inline conversion. Renderer reads
 *  these to decide indent / spacing / font; handlers receive a copy
 *  on each invocation. */
export interface RenderCtx {
  baseDir: string;
  schema?: Schema;
  /** When true, every body paragraph gets a first-line indent (legal
   *  block style). Per-paragraph Div attributes (`::: {.indent}`)
   *  compose with this. */
  indent?: boolean;
  /** Body first-line indent in twips. Default 540. */
  bodyIndent?: number;
  /** Twips of breathing room emitted by `::: {.gap}` blocks. Default 240. */
  gap?: number;
  /** Body paragraph spacing override. Doesn't affect tables / list items. */
  paraSpacing?: { before?: number; after?: number; line?: number };
  /** Document font, set per emitted run on heading paragraphs so the
   *  `w:rFonts` lands on the run instead of relying on style inheritance. */
  font?: string;
}

/** Handler for a fenced code block whose info string matches a
 *  registered class. Receives the raw fenced content (string) plus the
 *  current values + ctx; returns docx nodes. DSLs register one per
 *  custom block (legalese: `fields`, `sig`, `grid`, `panel`). */
export type FencedDocxHandler = (
  content: string,
  values: Record<string, unknown>,
  ctx: RenderCtx,
) => DocNode[];

/** Emit zero or more `TextRun`s for a single `{{...}}` marker. The
 *  default emitter (no DSL config) renders the marker text literally,
 *  which is rarely what you want — DSLs register a registry-aware
 *  emitter that resolves markers against schema + values.
 *
 *  `inner` is the text BETWEEN the braces, trimmed; `nextChar` is the
 *  source char immediately after the closing `}}` (used for trailing
 *  abbreviation-dot swallow). The emitter pushes runs onto `out`. */
export type MarkerEmitter = (
  inner: string,
  bold: boolean,
  italic: boolean,
  out: TextRun[],
  ctx: { values: Record<string, unknown>; schema: Schema | undefined },
  nextChar?: string,
) => void;

/** Handler for a Pandoc Span with a registered class. Receives
 *  contents (already inline-rendered as TextRuns) plus context; returns
 *  the runs to emit. DSLs use this for class-based inline styles
 *  (legalese: `.smallcaps`). The renderer handles `.underline` itself
 *  (Pandoc emits Underline nodes; the Span class is just an alias). */
export type SpanDocxHandler = (
  contents: TextRun[],
  /** Style context the renderer was running under when it hit the span. */
  style: { bold: boolean; italic: boolean; underline: boolean; font?: string },
) => TextRun[];

/** Base style overrides. All optional; fields not set fall back to
 *  house defaults. Set in front-matter under `style:`. Sizes are in
 *  twips unless noted (1440 twips = 1"); font sizes are in points.
 *
 *  This is the common typography surface — DSLs that need extra
 *  fields (e.g. signature heights, theorem environments) extend
 *  this interface in their own consumer code. */
export interface DocStyle {
  /** Font family name (e.g. "Times New Roman", "Garamond", "EB Garamond").
   *  The font must be installed where the doc is opened, or Word will
   *  substitute. Default "Times New Roman". */
  font?: string;
  /** Body font size in points. Default 12. */
  size?: number;
  /** Heading 1 font size in points. Default 14. */
  h1_size?: number;
  /** Heading 2 font size in points. Default 12. */
  h2_size?: number;

  /** Page margins. Each side in twips OR a single number that applies
   *  to all sides. Default 1440 (1") on all sides. */
  margin?: number | { top?: number; right?: number; bottom?: number; left?: number };

  /** Body paragraph spacing. */
  spacing?: {
    /** Twips before each paragraph. Default 120. */
    before?: number;
    /** Twips after each paragraph. Default 120. */
    after?: number;
    /** Line height in 240ths (240 = single, 360 = 1.5, 480 = double).
     *  Default 360 (1.5 lines). */
    line?: number;
  };

  list?: {
    /** Top-level numbered list: marker→body horizontal distance, in twips.
     *  Default 540 (~0.375"). */
    indent?: number;
    /** Lettered sub-list: body indent in twips. Default 900. */
    sub_indent?: number;
    /** Lettered sub-list: marker→body distance. Default 360. */
    sub_hanging?: number;
    /** Render top-level numbers bold (matches a `**Title.**` lead-in).
     *  Default true. Set false for plain numbering. */
    bold_marker?: boolean;
  };
  body?: {
    /** First-line indent (twips) applied when document-level `indent: true`
     *  or a `::: {.indent}` Div is in effect. Default 540 (~0.375"). */
    indent?: number;
  };
  /** Title (H1) styling overrides. */
  title?: {
    /** Title alignment. Default 'center'. */
    alignment?: 'left' | 'center' | 'right' | 'justified';
  };

  /** Vertical breathing room produced by `::: {.gap}` blocks. Empty
   *  `::: {.gap} :::` emits a blank paragraph with this much before/after
   *  spacing; non-empty `{.gap}` adds `before` (× 2) to the first child
   *  paragraph. Default 240 twips. */
  gap?: number;

  /** Multi-column page layout (academic-journal style). Supply a number
   *  for the simple "N equal columns" case (default 720-twip gap), or an
   *  object for full control. Applies document-wide. */
  columns?: number | {
    count: number;
    /** Gap between columns in twips. Default 720 (~0.5"). */
    space?: number;
    /** Render a vertical separator line between columns. */
    separate?: boolean;
    /** All columns same width. Default true. */
    equalWidth?: boolean;
  };
}

/** Front-matter extensions read by the docx orchestrator. DSLs can
 *  extend further; the renderer reads only these three. */
export interface DocxFrontMatter extends MarkdslFrontMatter {
  title?: string;
  output?: string;
  /** Document-level first-line indent on every body paragraph (legal
   *  block style). Equivalent to wrapping the entire body in
   *  `::: {.indent}`. */
  indent?: boolean;
  /** Per-document style overrides. */
  style?: DocStyle;
}

/** Renderer configuration. All fields are optional — pass an empty
 *  config and you get a working (if DSL-vocabulary-free) renderer. */
export interface DocxRenderConfig {
  /** Map of fenced-code-block class → handler.
   *  Built-in: none. Unknown classes log a warning and emit nothing. */
  fencedHandlers?: Record<string, FencedDocxHandler>;
  /** `{{...}}` marker emitter. Default: literal pass-through. */
  markerEmitter?: MarkerEmitter;
  /** Map of Span class → handler. Useful for class-based inline styles. */
  spanHandlers?: Record<string, SpanDocxHandler>;

  /** Optional text-level marker resolver. The renderer calls this on
   *  the front-matter title before assembly, so DSLs that use markers
   *  in titles (e.g. `BOARD RESOLUTIONS OF {{=COMPANY}}`) can resolve
   *  them with the same registry that drives the body. Default:
   *  identity. */
  resolveText?: (text: string, ctx: { schema?: Schema; values: Record<string, unknown> }) => string;
}
