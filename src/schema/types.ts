// Shared schema types. The shape is intentionally permissive: each DSL
// will use a different subset of the fields, and consumers can add
// custom keys (TypeScript will treat them as `unknown` on read, but
// they round-trip through the pipeline untouched).

/** A single schema field. Either a bare type alias (`"string"`,
 *  `"date"`, `"list"`, etc.) or an object descriptor. The bare-string
 *  shorthand exists only to register a slug — every meaningful
 *  configuration goes through the descriptor. */
export type SchemaEntry =
  | string
  | {
      /** Type tag — informational only; no validation enforced here.
       *  Consumers may special-case 'date' / 'list' / etc. */
      type?: string;
      /** When true, `missingRequired()` flags this key if no value is
       *  supplied at render time. */
      required?: boolean;
      /** Baked-in default value. Wins only when nothing else in the
       *  caller > frontmatter chain provides a value. */
      default?: unknown;

      /** Short label used by defined-term markers (the text inside
       *  parens like `(the *"Term"*)`). Defaults to `key` snake → Title. */
      term?: string;
      /** Long-form prose expansion attached to a defined term — the
       *  text BEFORE the parenthetical. Used by introduce-form markers.
       *  Stable per template; per-deal data goes in values. */
      def?: string;

      /** Article for singular references and `the`-prefix introductions.
       *    true   → 'the' (default)
       *    false  → none (proper-noun rendering: just *"Term"*)
       *    string → use this article verbatim ('a', 'an', 'such', …) */
      article?: boolean | string;
      /** Article for plural references. Falls back to `article` when
       *  unset. */
      plural_article?: boolean | string;
      /** Explicit plural for irregulars ("Person" → "People"). The
       *  default rules cover most regular English nouns. */
      plural?: string;

      /** Long-form descriptor used as the field-row label in form
       *  blocks and as schema-introspection output. */
      description?: string;

      /** Free-form additional fields. DSL consumers can stash anything
       *  here; the pipeline doesn't read these but doesn't strip them. */
      [k: string]: unknown;
    };

/** Map of value keys to schema entries declared in front-matter. */
export type Schema = Record<string, SchemaEntry>;

/** Parsed YAML front-matter. Open-ended so DSLs can add their own
 *  top-level keys; `schema` and `values` are the two markdsl reads. */
export interface FrontMatter {
  schema?: Schema;
  values?: Record<string, unknown>;
  [k: string]: unknown;
}

/** Per-key resolved value bag — the merged result of caller >
 *  frontmatter > schema-default. Open-ended `unknown` values; consumers
 *  cast as appropriate at the read site. */
export type Values = Record<string, unknown>;
