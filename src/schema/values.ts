// Value resolution: merging caller / frontmatter / schema-default
// sources and surfacing required fields that haven't been filled in.
// Pure functions — no markdown awareness, no I/O.

import type { Schema, Values } from './types';

/** Merge multiple value sources into one map. Later sources win.
 *  `undefined` entries are skipped (they don't shadow earlier values).
 *
 *  Typical pipeline call:
 *    mergeValues(schemaDefaults(schema), frontmatter.values, caller.values)
 *
 *  Caller wins, frontmatter is the fallback, schema's `default:` fills
 *  anything still missing. */
export function mergeValues(...sources: (Values | undefined)[]): Values {
  const out: Values = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

/** Pull per-key `default:` values out of a schema. Used as the lowest
 *  layer of `mergeValues` so authoring `default: "State of Delaware"`
 *  on a schema entry pre-fills the field. */
export function schemaDefaults(schema: Schema | undefined): Values {
  const out: Values = {};
  if (!schema) return out;
  for (const [key, entry] of Object.entries(schema)) {
    if (typeof entry === 'object' && entry !== null && entry.default !== undefined) {
      out[key] = entry.default;
    }
  }
  return out;
}

/** Return the keys flagged `required: true` in the schema that don't
 *  have a value in `merged`. Empty strings count as missing — a blank
 *  field hasn't been filled. Returns sorted keys for stable output
 *  (useful in CLI `--schema` dumps and tests). */
export function missingRequired(merged: Values, schema: Schema | undefined): string[] {
  if (!schema) return [];
  const missing: string[] = [];
  for (const [key, entry] of Object.entries(schema)) {
    if (typeof entry !== 'object' || entry === null) continue;
    if (entry.required !== true) continue;
    const v = merged[key];
    if (v === undefined || v === null || v === '') {
      missing.push(key);
    }
  }
  return missing.sort();
}

/** Parse a `key=value` CLI-style flag into a tuple. Throws on a
 *  malformed flag so the caller can surface it cleanly. */
export function parseSetFlag(arg: string): [string, string] {
  const eq = arg.indexOf('=');
  if (eq < 1) {
    throw new Error(`parseSetFlag: expected "key=value", got: ${arg}`);
  }
  return [arg.slice(0, eq), arg.slice(eq + 1)];
}
