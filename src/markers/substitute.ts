// Walks a markdown body, finds every `{{...}}` marker, and dispatches
// to a handler from the registry based on the inner text's first
// character. The returned text is plain markdown — pipe to pandoc for
// further processing.

import type { Schema, Values } from '../schema/types';
import type { MarkerContext, MarkerRegistry } from './registry';

const MARKER_RE = /\{\{([^}]+)\}\}/g;

/** Substitute every `{{...}}` marker in `body` using the supplied
 *  registry. The output is markdown text (with whatever emphasis /
 *  inline HTML / curly quotes the handlers chose to emit).
 *
 *  Dispatch:
 *    1. Trim the inner text.
 *    2. If the first character is a registered prefix, strip it and
 *       call the handler with the remaining (also trimmed) text.
 *    3. Otherwise call the fallback (`''` key), if registered.
 *    4. If neither is registered, leave the marker in place verbatim.
 *       Visible-by-default is the right behavior for partial setups.
 *
 *  The handler also receives the source character immediately after
 *  `}}` (`ctx.next`), useful for context-sensitive rendering like
 *  trailing-dot swallow or sentence-end detection. */
export function substituteMarkers(
  body: string,
  registry: MarkerRegistry,
  opts: { schema?: Schema; values?: Values } = {},
): string {
  const values = opts.values ?? {};
  const schema = opts.schema;

  return body.replace(MARKER_RE, (full, inner: string, offset: number) => {
    const trimmed = inner.trim();
    if (!trimmed) return full;  // `{{ }}` is meaningless — leave it visible

    const next = body[offset + full.length];
    const ctx: MarkerContext = { values, schema, next, rawInner: trimmed };

    const first = trimmed.charAt(0);
    const prefixed = registry.prefixes[first];
    if (prefixed) {
      return prefixed(trimmed.slice(1).trim(), ctx);
    }

    const fallback = registry.prefixes[''];
    if (fallback) return fallback(trimmed, ctx);

    return full;
  });
}
