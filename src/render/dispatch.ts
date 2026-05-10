// Dispatchers — produce `BlockHandler`s from class-keyed handler maps.
// Consumers register the result under `AstHandlers.blocks.CodeBlock` /
// `AstHandlers.blocks.Div` and the framework routes appropriately.

import type { BlockHandler } from '../ast/types';
import { parseDivAttrs, parseCodeBlockAttrs } from './attrs';
import type { DivClassHandler, FencedHandler } from './types';

/** Build a CodeBlock handler that dispatches by language class.
 *
 *  The first class on the CodeBlock is treated as the language tag
 *  (`\`\`\`fields` puts `'fields'` first). If a handler is registered
 *  under that key, the block's content is parsed and rendered.
 *  Otherwise the `fallback` handler runs (or `[]` if no fallback). */
export function dispatchFenced<B, I, Ext = undefined>(
  // `any` for T is intentional: each FencedHandler internally pins its
  // own T (parse → T → render), but the map holds heterogeneous handlers
  // with different T types. `unknown` would force every handler's T to
  // unify, which they can't.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlersByLang: Record<string, FencedHandler<B, I, any, Ext>>,
  fallback?: BlockHandler<B, I, Ext>,
): BlockHandler<B, I, Ext> {
  return (node, ctx, walk) => {
    const { classes, content } = parseCodeBlockAttrs(node);
    const lang = classes[0];
    const handler = lang ? handlersByLang[lang] : undefined;
    if (handler) {
      const parsed = handler.parse(content);
      return handler.render(parsed, ctx, walk);
    }
    return fallback ? fallback(node, ctx, walk) : [];
  };
}

/** Build a Div handler that dispatches by the first matching class.
 *
 *  Pandoc Divs can carry multiple classes; this dispatcher picks the
 *  first class with a registered handler and runs only that one.
 *  Multi-class composition (where several classes' effects should
 *  stack) is NOT handled here — consumers needing that write their
 *  own block handler using `parseDivAttrs` directly. */
export function dispatchDiv<B, I, Ext = undefined>(
  handlersByClass: Record<string, DivClassHandler<B, I, Ext>>,
  fallback?: BlockHandler<B, I, Ext>,
): BlockHandler<B, I, Ext> {
  return (node, ctx, walk) => {
    const attrs = parseDivAttrs(node);
    for (const cls of attrs.classes) {
      const handler = handlersByClass[cls];
      if (handler) {
        return handler.render(attrs.children, attrs, ctx, walk);
      }
    }
    return fallback ? fallback(node, ctx, walk) : [];
  };
}
