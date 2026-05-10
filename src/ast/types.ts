// AST visitor type contracts. Generic over BlockOut (`B`), InlineOut
// (`I`), and consumer extension state (`Ext`). The walker dispatches
// per-node `t` (the Pandoc tag string); handlers return arrays of
// outputs and recurse via the supplied `walk` parameter.

import type { Schema, Values } from '../schema/types';
import type { PandocBlock, PandocInline } from '../pandoc/types';

/** Context threaded through every handler call. `values` and `schema`
 *  are stable for the duration of a render; `ext` is whatever DSL-
 *  specific state the consumer wants to thread (font, current indent,
 *  section level, etc.). */
export interface RenderContext<Ext = undefined> {
  values: Values;
  schema: Schema | undefined;
  ext: Ext;
}

/** Walker handle passed to every handler so it can recurse into
 *  children. Methods return arrays so a single node can produce
 *  multiple outputs (a `Div` exploding into several paragraphs, etc.). */
export interface AstWalker<B, I, Ext = undefined> {
  /** Render a single block node. */
  block(node: PandocBlock): B[];
  /** Render a single inline node. */
  inline(node: PandocInline): I[];
  /** Render an array of block nodes — convenience over mapping. */
  blocks(nodes: PandocBlock[]): B[];
  /** Render an array of inline nodes — convenience over mapping. */
  inlines(nodes: PandocInline[]): I[];
  /** The render context. Handlers read `walk.ctx` rather than receiving
   *  it as a separate parameter when they only need a peek. */
  readonly ctx: RenderContext<Ext>;
}

export type BlockHandler<B, I, Ext = undefined> = (
  node: PandocBlock,
  ctx: RenderContext<Ext>,
  walk: AstWalker<B, I, Ext>,
) => B[];

export type InlineHandler<B, I, Ext = undefined> = (
  node: PandocInline,
  ctx: RenderContext<Ext>,
  walk: AstWalker<B, I, Ext>,
) => I[];

/** Per-node-type handlers. Map keys are the Pandoc node `t` values
 *  ("Para", "Header", "Strong", etc.). Anything not in the map falls
 *  through to the corresponding `unknownBlock` / `unknownInline`
 *  handler, or the framework's default if none is supplied. */
export interface AstHandlers<B, I, Ext = undefined> {
  blocks?: Record<string, BlockHandler<B, I, Ext>>;
  inlines?: Record<string, InlineHandler<B, I, Ext>>;
  /** Catch-all for block nodes with no specific handler. The default
   *  recurses into children for known wrapper blocks (Div, BlockQuote)
   *  and returns `[]` for leaves. */
  unknownBlock?: BlockHandler<B, I, Ext>;
  /** Catch-all for inline nodes with no specific handler. The default
   *  recurses into children for known wrapper inlines (Strong, Emph,
   *  Underline, Strikeout, Span, Quoted) and returns `[]` for leaves. */
  unknownInline?: InlineHandler<B, I, Ext>;
}

/** Wrapper-block tags whose default unhandled behavior is "recurse
 *  into children blocks". Exposed so consumers can extend the set if
 *  they author additional wrapper-shaped block types. */
export const DEFAULT_WRAPPER_BLOCKS: ReadonlySet<string> = new Set([
  'Div', 'BlockQuote',
]);

/** Wrapper-inline tags whose default unhandled behavior is "recurse
 *  into children inlines". */
export const DEFAULT_WRAPPER_INLINES: ReadonlySet<string> = new Set([
  'Strong', 'Emph', 'Underline', 'Strikeout', 'Superscript', 'Subscript',
  'SmallCaps', 'Span', 'Quoted',
]);
