// English-language term helpers. Pure string transforms — no
// markdown awareness, no schema-side-effects. These are the building
// blocks marker handlers reach for when resolving a key into something
// human-readable.

import type { Schema, SchemaEntry } from './types';

/** Snake_case → Title Case ("monthly_fee" → "Monthly Fee"). The default
 *  used when a schema entry has no explicit `term:`. */
export function deriveLabel(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Light typographic clean-up applied to every emitted label. Intent:
 *  labels read naturally regardless of output format.
 *
 *  - Curly quotes: `"X"` → `“X”`, `'X'` → `‘X’` (smart quotes)
 *  - NBSP after one-letter abbreviations (`U.S.A. inc.` keeps a hard
 *    space before "inc.", so it doesn't break across lines).
 *
 *  Kept conservative — markdown / pandoc's `+smart` extension also does
 *  a lot of this downstream, but labels are rendered as-is in some
 *  contexts (sig blocks, grid headers) so we apply it at the source. */
export function smartLabel(s: string): string {
  if (!s) return s;
  return s
    .replace(/"([^"]*)"/g, '“$1”')
    .replace(/(?<!\w)'([^']*)'(?!\w)/g, '‘$1’');
}

/** Pluralize an English label. Handles the common rules; irregulars
 *  belong in `schema[key].plural`. */
export function pluralizeLabel(label: string): string {
  if (!label) return label;
  // y → ies after a consonant ("party" → "parties")
  if (/[^aeiou]y$/i.test(label)) return label.slice(0, -1) + 'ies';
  // s/x/z/ch/sh → +es ("box" → "boxes", "church" → "churches")
  if (/(s|x|z|ch|sh)$/i.test(label)) return label + 'es';
  return label + 's';
}

/** Pick `a` vs `an` based on the leading sound of the term. Vowel-letter
 *  heuristic with the standard short list of exceptions. The label is
 *  read in English — non-English templates should set `article:`
 *  explicitly per entry. */
export function pickAOrAn(term: string): 'a' | 'an' {
  const first = term.trim().toLowerCase();
  // "an honor" / "an hour" — silent H
  if (/^(honor|honest|hour|heir)/.test(first)) return 'an';
  // "a unicorn" / "a user" / "a one-time" / "a euro" — yoo-/wuh-sound
  if (/^(uni|use|user|euro|one)/.test(first)) return 'a';
  return /^[aeiou]/.test(first) ? 'an' : 'a';
}

/** Capitalize the first character of a string. Safe on empty strings. */
export function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// — Bidirectional schema lookup —
//
// `parties` should resolve through `party` (then pluralize); `recording`
// should resolve through `recordings` (then singularize). This lets the
// author declare a singular OR plural in schema and reference both.
function resolveBidirectional(
  key: string,
  schema: Schema,
): { entry: SchemaEntry; asPlural: boolean } | undefined {
  // Try plural-side first: `key` ends in -ies/-es/-s, look for the singular.
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
 *    1. Direct schema hit (uses entry.term, snake → Title fallback).
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
 *  applied. Returns undefined when no def is set. */
export function termDef(key: string, schema: Schema | undefined): string | undefined {
  const entry: SchemaEntry | undefined = schema?.[key];
  if (typeof entry === 'object' && entry !== null && entry.def) {
    return smartLabel(entry.def);
  }
  return undefined;
}
