// Value reading and formatting utilities. Pure transforms — no schema
// awareness, no marker semantics. The aim is to give marker handlers
// a uniform "is there a usable string for this key?" answer so each
// handler doesn't reimplement value coercion.

import type { Values } from './types';

/** Case-insensitive value lookup. Marker keys are normalized to
 *  lowercase by `parseMarker`; this helper accommodates value maps
 *  authored in either case (frontmatter often has mixed case from
 *  human authors, CLI `--set` flags pass through verbatim). */
export function lookupValue(key: string, values: Values): unknown {
  if (key in values) return values[key];
  const lc = key.toLowerCase();
  for (const k of Object.keys(values)) {
    if (k.toLowerCase() === lc) return values[k];
  }
  return undefined;
}

/** Coerce any value into a prose-usable string, or `null` if the value
 *  isn't suitable for inline rendering.
 *
 *  Behaviour:
 *    - `null` / `undefined`           → null
 *    - `''` (empty string)            → null
 *    - whitespace-only string         → null
 *    - string                         → trimmed, internal whitespace folded
 *    - number / boolean               → String(v)
 *    - array of scalars               → English-list join: "A", "A and B",
 *                                       "A, B, and C"
 *    - array containing any object    → null (catalog data, not prose)
 *    - object                         → null (handlers that want object
 *                                       handling do it themselves)
 *
 *  Whitespace folding matters for YAML `|-` block scalars used to wrap
 *  long single-sentence values — `formatValue` collapses internal
 *  newlines to spaces so the prose flows naturally. Authors who
 *  actually want a paragraph break write a separate paragraph, not a
 *  single-value `|-` block. */
export function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    if (value.some((v) => v !== null && typeof v === 'object')) return null;
    const parts = value
      .map((v) => foldLines(String(v ?? '')))
      .filter((s) => s !== '');
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0]!;
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  }

  if (typeof value === 'object') return null;

  const s = foldLines(String(value));
  return s === '' ? null : s;
}

/** Collapse runs of whitespace (spaces, newlines, tabs) into single
 *  spaces and trim. Exported for handlers that want the same folding
 *  behavior on text that didn't go through `formatValue`. */
export function foldLines(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
