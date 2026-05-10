// Cross-cutting public types for the docx renderer. Generic — no DSL
// vocabulary leaks through here; DSL-specific blocks/markers/spans
// arrive via the handler maps on DocxRenderConfig.

import type { Paragraph, Table, TextRun } from 'docx';

import type { Schema } from '../schema';

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
}
