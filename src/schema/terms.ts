// Pure English-language utilities. No schema arguments, no values
// arguments — just string transforms. Schema-aware readers live in
// `lookup.ts` (termLabel, fieldLabel, termDef).

/** Snake_case → Title Case ("monthly_fee" → "Monthly Fee"). The default
 *  used when a schema entry has no explicit `term:`. */
export function deriveLabel(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Light typographic clean-up applied to label-like strings. Intent:
 *  labels read naturally regardless of output format.
 *
 *  - Curly quotes: `"X"` → `“X”`, `'X'` → `‘X’` (smart quotes)
 *
 *  Conservative on purpose — markdown/pandoc's `+smart` extension also
 *  does this downstream, but labels are rendered as-is in some contexts
 *  (sig headers, grid column labels) so we apply it at the source. */
export function smartLabel(s: string): string {
  if (!s) return s;
  return s
    .replace(/"([^"]*)"/g, '“$1”')
    .replace(/(?<!\w)'([^']*)'(?!\w)/g, '‘$1’');
}

/** Pluralize an English label. Handles the common rules; irregulars
 *  belong in `schema[key].plural` (see `lookup.termLabel`). */
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
