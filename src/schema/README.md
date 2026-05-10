# schema/

Schema-driven value resolution. Pure string transforms — no markdown parsing,
no AST walking, no output emission. This module is what every DSL backend (docx,
TeX, HTML) shares for understanding what fields a template declares and how
to resolve a key into a label / definition / per-deal value.

## What lives here

- **`types.ts`** — `Schema`, `SchemaEntry`, `FrontMatter`, `Values`. The
  data model every consumer agrees on.
- **`values.ts`** — value merging (caller > frontmatter > defaults),
  missing-required detection, schema defaults, CLI flag parsing.
- **`terms.ts`** — **pure** English-language helpers (no schema/values
  arguments): `deriveLabel` (snake→Title), `smartLabel` (curly quotes),
  `pluralizeLabel`, `pickAOrAn`, `cap`.
- **`lookup.ts`** — **schema-aware** readers (take a schema or values
  arg): `lookupValue` (case-insensitive), `formatValue` (any value →
  prose string or null), `foldLines`, `termLabel`, `fieldLabel`,
  `termDef`. The clean axis: pure transforms in `terms.ts`, parameterized
  readers in `lookup.ts`.

## Schema model

A `Schema` is a record of `SchemaEntry`. Each entry can be:

```yaml
# Bare type alias — registers the slug, label auto-derives.
location:        # equivalent to `{ type: 'string' }`

# Full descriptor.
monthly_fee:
  type: string             # 'string' | 'date' | 'list' | …
  required: true           # missingRequired() flags this if no value supplied
  default: "$1,500"        # baked-in fallback (rarely used in practice)
  term: Monthly Fee        # short label inside parenthetical defines.
                           # auto-derives from key (snake → Title) when unset.
  def: |                   # the prose expansion before the parenthetical.
    a fixed monthly amount # used by introduce-form markers in legalese.
  article: a               # default 'the'; false = no article (proper nouns).
  plural_article: false
  plural: "Monthly Fees"   # explicit plural for irregulars.
  description: ...         # surfaces in field-table rows etc.
```

Most consumers won't use every field — `term`, `def`, `description`, and
`required` carry the bulk of the load. The shape is intentionally
permissive: each DSL adds whichever fields it needs, and unknown fields
flow through untouched.

## Value resolution

`mergeValues(...sources)` does last-wins shallow merge over an array of
record objects, dropping `undefined`. The pipeline calls it with:

```
schemaDefaults(schema) → frontmatter.values → caller-supplied values
```

so caller wins, frontmatter is fallback, and `default:` from the schema
fills in anything still missing.

`missingRequired(merged, schema)` returns the keys flagged `required: true`
that don't have a value in `merged`. Empty strings are treated as
missing — a blank field hasn't been filled out.

## Term helpers

Pure English-language utilities. None of these touch Pandoc, the marker
grammar, or the output format — they just turn a snake_case key + schema
into a human-readable label.

- `termLabel(key, schema)` — the short label for a defined term.
  Resolves through `schema[key].term`, then bidirectional plural lookup
  (e.g. `parties` resolves to `party.plural` or pluralizes `party.term`),
  then snake → Title from the key itself.
- `fieldLabel(key, schema)` — the label for form-field rows. Prefers
  `schema[key].description`, falls back to `term`, then snake → Title.
- `pickAOrAn(label)` — vowel-sound heuristic with the standard exceptions
  (`an honor`, `a unicorn`, `a one-time`).
- `pluralize(label)` — common English pluralization rules.
- `smartLabel(s)` — light typographic clean-up (curly quotes, NBSP after
  abbreviations) so labels read naturally in any output format.

## Why these are EN-only and that's OK

Term resolution leans on English noun morphology (plurals, articles).
A future internationalization story would either:

1. Replace these helpers per-locale (e.g. an `LangAdapter` interface
   passed into the pipeline), or
2. Demand explicit `plural:` and `article:` on every entry in non-English
   templates — the existing fields already cover that escape hatch.

Both are deferrable; the schema model stays neutral.
