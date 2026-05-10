// Render contracts for fenced blocks (`\`\`\`lang`) and Div classes
// (`::: {.class}`). Both are just Pandoc CodeBlock / Div nodes with
// their classes carrying routing information.

import type { PandocBlock } from '../pandoc/types';
import type {
  AstWalker,
  BlockHandler,
  RenderContext,
} from '../ast/types';

/** Pandoc Div / CodeBlock attribute tuple, exploded into a struct. The
 *  raw JSON shape is `[id, classes, kvs]` — positional and easy to
 *  fumble. This is the named version. */
export interface PandocAttrs {
  /** Optional `#id` from `::: {.class #id}` syntax; empty string when
   *  no id is present. */
  id: string;
  /** All `.class` classes the author attached to the block. */
  classes: string[];
  /** `key=value` attributes from `{.class key=val}` syntax. */
  kvs: Array<[string, string]>;
}

/** Div with parsed attrs + already-extracted children blocks. */
export interface DivAttrs extends PandocAttrs {
  children: PandocBlock[];
}

/** CodeBlock with parsed attrs + raw content. */
export interface CodeBlockAttrs extends PandocAttrs {
  /** The literal text between the fence lines. Up to the handler to
   *  parse (YAML, plain text, JSON, whatever). */
  content: string;
}

/** Handler for a single fenced-language. `parse` turns the block
 *  content (YAML / plain text / etc.) into a typed structure;
 *  `render` produces block outputs. Splitting parse from render lets
 *  one parser drive multiple backends. */
export interface FencedHandler<B, I, T = unknown, Ext = undefined> {
  parse: (content: string) => T;
  render: (
    parsed: T,
    ctx: RenderContext<Ext>,
    walk: AstWalker<B, I, Ext>,
  ) => B[];
}

/** Handler for a single Div class. Receives the original children
 *  verbatim — the handler decides whether to walk them, modify them,
 *  or replace them entirely. */
export interface DivClassHandler<B, I, Ext = undefined> {
  render: (
    children: PandocBlock[],
    attrs: DivAttrs,
    ctx: RenderContext<Ext>,
    walk: AstWalker<B, I, Ext>,
  ) => B[];
}

/** Identity factory for `FencedHandler`. Mostly here for symmetry with
 *  `defineMarker` / `defineDiv` and a hook for future validation. */
export function defineFenced<B, I, T = unknown, Ext = undefined>(
  handler: FencedHandler<B, I, T, Ext>,
): FencedHandler<B, I, T, Ext> {
  return handler;
}

/** Identity factory for `DivClassHandler`. */
export function defineDiv<B, I, Ext = undefined>(
  handler: DivClassHandler<B, I, Ext>,
): DivClassHandler<B, I, Ext> {
  return handler;
}

/** Re-exported for ergonomics: callers building dispatchers usually
 *  also need BlockHandler. */
export type { BlockHandler };
