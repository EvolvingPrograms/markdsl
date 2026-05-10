// Pull the Pandoc Div / CodeBlock JSON shape apart into named structs.
// The raw shape is positional and easy to fumble; these helpers
// centralize the unwrap so consumers don't reach into `c[0][1]`
// throughout their handlers.

import type { PandocBlock } from '../pandoc/types';
import type { CodeBlockAttrs, DivAttrs, PandocAttrs } from './types';

/** Empty attrs — used as a fallback when a Div / CodeBlock arrives
 *  with an unexpected shape (defensive parse). */
const EMPTY_ATTRS: PandocAttrs = { id: '', classes: [], kvs: [] };

function readAttrs(raw: unknown): PandocAttrs {
  if (!Array.isArray(raw) || raw.length < 3) return EMPTY_ATTRS;
  const id = typeof raw[0] === 'string' ? raw[0] : '';
  const classes = Array.isArray(raw[1])
    ? (raw[1] as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  const kvs = Array.isArray(raw[2])
    ? (raw[2] as unknown[]).filter(
        (kv): kv is [string, string] =>
          Array.isArray(kv) && kv.length === 2 && typeof kv[0] === 'string' && typeof kv[1] === 'string',
      )
    : [];
  return { id, classes, kvs };
}

/** Parse a Pandoc `Div` block's `c` field (which is `[attrs, children]`)
 *  into a `DivAttrs` struct + children. */
export function parseDivAttrs(node: PandocBlock): DivAttrs {
  if (node.t !== 'Div' || !Array.isArray(node.c)) {
    return { ...EMPTY_ATTRS, children: [] };
  }
  const c = node.c as [unknown, unknown];
  const attrs = readAttrs(c[0]);
  const children = Array.isArray(c[1]) ? (c[1] as PandocBlock[]) : [];
  return { ...attrs, children };
}

/** Parse a Pandoc `CodeBlock` node's `c` field (`[attrs, content]`)
 *  into a `CodeBlockAttrs` struct + literal content string. */
export function parseCodeBlockAttrs(node: PandocBlock): CodeBlockAttrs {
  if (node.t !== 'CodeBlock' || !Array.isArray(node.c)) {
    return { ...EMPTY_ATTRS, content: '' };
  }
  const c = node.c as [unknown, unknown];
  const attrs = readAttrs(c[0]);
  const content = typeof c[1] === 'string' ? c[1] : '';
  return { ...attrs, content };
}
