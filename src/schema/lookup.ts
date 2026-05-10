// Schema/values readers. Each function takes a schema or values map
// and produces a normalized string (or null for "no usable value").
// Pure pure-language helpers — `cap`, `pickAOrAn`, etc. — live in
// `terms.ts` and don't read schema/values.

import type { Schema, SchemaEntry, Values } from './types';
import { deriveLabel, smartLabel, pluralizeLabel } from './terms';

// — Value lookup + formatting —

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

// — Schema-side label / definition readers —
//
// These look up entry fields and apply normalization. The reads are
// the standard markdsl schema vocabulary: `term`, `description`, `def`,
// `plural`. DSLs that don't use one of these fields just don't call the
// matching reader.

/** Bidirectional sibling lookup — `parties` finds `party.plural` (or
 *  pluralizes `party.term`); `recording` finds `recordings.term` (or
 *  singularizes it). Lets the author declare a singular OR plural and
 *  reference the other via the schema. */
function resolveBidirectional(
  key: string,
  schema: Schema,
): { entry: SchemaEntry; asPlural: boolean } | undefined {
  // Try plural-side first: key ends in -ies/-es/-s, look for the singular.
  const stems: string[] = [];
  if (key.endsWith('ies')) stems.push(key.slice(0, -3) + 'y');
  if (key.endsWith('es')) stems.push(key.slice(0, -2));
  if (key.endsWith('s')) stems.push(key.slice(0, -1));
  for (const s of stems) {
    if (schema[s] !== undefined) return { entry: schema[s], asPlural: true };
  }
  // Otherwise treat `key` as singular and look for the plural.
  const e = schema[key + 's'];
  if (e !== undefined) return { entry: e, asPlural: false };
  return undefined;
}

/** Resolve the display label for a defined-term reference. Resolution
 *  order:
 *    1. Direct schema hit (uses `entry.term`, smart-quoted).
 *    2. Bidirectional sibling lookup — `parties` finds `party` and
 *       returns the pluralized form; `recording` finds `recordings`
 *       and returns the singularized form.
 *    3. Snake → Title from the key itself. */
export function termLabel(key: string, schema: Schema | undefined): string {
  if (schema) {
    const direct = schema[key];
    if (typeof direct === 'object' && direct !== null && direct.term) {
      return smartLabel(direct.term);
    }
    if (typeof direct === 'string') return deriveLabel(key);

    const bi = resolveBidirectional(key, schema);
    if (bi) {
      const { entry, asPlural } = bi;
      if (typeof entry === 'object' && entry !== null) {
        const baseTerm = entry.term ? smartLabel(entry.term) : null;
        if (asPlural) {
          // `key` is the plural side; entry stores the singular.
          if (entry.plural) return smartLabel(entry.plural);
          return pluralizeLabel(baseTerm ?? deriveLabel(key.replace(/(ies|es|s)$/, '')));
        } else {
          // `key` is the singular side; strip the trailing plural off
          // entry.term to recover the singular display.
          if (baseTerm) {
            return baseTerm.replace(/ies$/, 'y').replace(/es$/, '').replace(/s$/, '');
          }
        }
      }
    }
  }
  return deriveLabel(key);
}

/** Resolve the label for a form-field row. Form blocks prefer a longer
 *  human descriptor when one is available — `description` wins over
 *  `term` wins over snake → Title. */
export function fieldLabel(key: string, schema: Schema | undefined): string {
  const entry: SchemaEntry | undefined = schema?.[key];
  if (typeof entry === 'object' && entry !== null) {
    if (entry.description) return entry.description;
    if (entry.term) return smartLabel(entry.term);
  }
  return deriveLabel(key);
}

/** Read the `def:` (definition prose) for a key, with smart-quoting
 *  applied. Returns `undefined` when no def is set. Handlers that want
 *  to compose value+def with a comma do that themselves. */
export function termDef(key: string, schema: Schema | undefined): string | undefined {
  const entry: SchemaEntry | undefined = schema?.[key];
  if (typeof entry === 'object' && entry !== null && entry.def) {
    return smartLabel(entry.def);
  }
  return undefined;
}
