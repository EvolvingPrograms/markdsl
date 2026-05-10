// AST walker — given a handler map and a context, produces an
// `AstWalker` that handlers use to recurse through the tree.
//
// The walker is the only path through the AST. Handlers always recurse
// via `walk.inline(...)` / `walk.inlines(...)` rather than calling
// other handlers directly, so the framework can intercept every
// traversal (for tracing, default fallthroughs, etc.).

import type { PandocBlock, PandocInline } from '../pandoc/types';
import {
  type AstHandlers,
  type AstWalker,
  type BlockHandler,
  type InlineHandler,
  type RenderContext,
  DEFAULT_WRAPPER_BLOCKS,
  DEFAULT_WRAPPER_INLINES,
} from './types';

/** Get the children of a wrapper-shaped block node. Pandoc's Div /
 *  BlockQuote / etc. encode children as `c[1]` (after attrs) or `c`
 *  directly depending on the node — this helper centralizes the
 *  unwrap so the walker doesn't case on tag names. */
function blockChildren(node: PandocBlock): PandocBlock[] {
  // Div: c = [attrs, children]
  if (node.t === 'Div') {
    const c = node.c as [unknown, PandocBlock[]];
    return c[1] ?? [];
  }
  // BlockQuote: c = children directly
  if (node.t === 'BlockQuote') {
    return (node.c as PandocBlock[]) ?? [];
  }
  return [];
}

/** Get the children of a wrapper-shaped inline node. The encoding
 *  differs by tag (Span has [attrs, children]; Strong/Emph have
 *  children directly; Quoted has [quoteType, children]) — handle each
 *  shape so the default recurse "just works". */
function inlineChildren(node: PandocInline): PandocInline[] {
  switch (node.t) {
    // Wrappers with attrs first.
    case 'Span':
      return ((node.c as [unknown, PandocInline[]])?.[1]) ?? [];
    // Wrappers with quote-type first.
    case 'Quoted':
      return ((node.c as [unknown, PandocInline[]])?.[1]) ?? [];
    // Plain wrappers — children are c directly.
    case 'Strong':
    case 'Emph':
    case 'Underline':
    case 'Strikeout':
    case 'Superscript':
    case 'Subscript':
    case 'SmallCaps':
      return (node.c as PandocInline[]) ?? [];
    default:
      return [];
  }
}

/** Build an AstWalker bound to the given handlers and context. The
 *  returned walker is safe to retain across a whole render — it
 *  closes over `ctx` and the handler maps. */
export function createWalker<B, I, Ext = undefined>(
  handlers: AstHandlers<B, I, Ext>,
  ctx: RenderContext<Ext>,
): AstWalker<B, I, Ext> {
  // Default wrapper-block behavior: recurse into children.
  const defaultBlock: BlockHandler<B, I, Ext> = (node, _c, w) => {
    if (DEFAULT_WRAPPER_BLOCKS.has(node.t)) {
      return w.blocks(blockChildren(node));
    }
    return [];
  };

  // Default wrapper-inline behavior: recurse into children.
  const defaultInline: InlineHandler<B, I, Ext> = (node, _c, w) => {
    if (DEFAULT_WRAPPER_INLINES.has(node.t)) {
      return w.inlines(inlineChildren(node));
    }
    return [];
  };

  const onBlock = handlers.unknownBlock ?? defaultBlock;
  const onInline = handlers.unknownInline ?? defaultInline;

  // Forward declaration so `block`/`inline` can call each other through
  // a stable `walker` reference handed to handlers.
  const walker: AstWalker<B, I, Ext> = {
    ctx,
    block(node) {
      const handler = handlers.blocks?.[node.t];
      if (handler) return handler(node, ctx, walker);
      return onBlock(node, ctx, walker);
    },
    inline(node) {
      const handler = handlers.inlines?.[node.t];
      if (handler) return handler(node, ctx, walker);
      return onInline(node, ctx, walker);
    },
    blocks(nodes) {
      const out: B[] = [];
      for (const n of nodes) for (const x of walker.block(n)) out.push(x);
      return out;
    },
    inlines(nodes) {
      const out: I[] = [];
      for (const n of nodes) for (const x of walker.inline(n)) out.push(x);
      return out;
    },
  };

  return walker;
}
