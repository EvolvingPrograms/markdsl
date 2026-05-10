# markdsl

Markdown-DSL pipeline framework. Schema-driven values, prefix-dispatch
markers, Pandoc AST walkers, and an in-source docx renderer. Used by
[legalese](https://github.com/EvolvingPrograms/legalese) (`.docx` legal
documents) and [texdown](https://github.com/EvolvingPrograms/texdown)
(LaTeX academic papers).

```
bun add markdsl
```

The system `pandoc` binary is required for the default parse path.
For browser / serverless use, install the optional `pandoc-wasm` peer
and pass `runPandocWasm` as the parser.

## What it gives you

Five pieces, mix and match:

| Module | Purpose |
|---|---|
| `splitFrontMatter` | YAML front-matter parser (`---\n...\n---`) |
| `schema/` | `mergeValues`, `schemaDefaults`, `missingRequired`, `termLabel`, `termDef`, `termArticle`, `parseSetFlag`, label/article utilities |
| `markers/` | `{{...}}` walker (`substituteMarkers`) + a registry of prefix handlers + parse / compose helpers |
| `pandoc/` | `runPandoc` (system binary) and `runPandocWasm` (optional peer) |
| `markdsl/docx` | Generic Pandoc → docx renderer with fenced / div / span / marker extension points |

Every piece is independent; you can use just `splitFrontMatter` or
just the marker walker.

## Front-matter

```ts
import { splitFrontMatter } from 'markdsl';

const src = `---
title: Hello
values:
  who: World
---

Greetings, {{who}}.
`;

const { meta, body } = splitFrontMatter(src);
// meta.title === 'Hello'
// body === '\nGreetings, {{who}}.\n'
```

Pass a generic for a typed `meta`:

```ts
interface MyMeta { title?: string; values?: Record<string, unknown> }
const { meta } = splitFrontMatter<MyMeta>(src);
```

## Schema + values

A schema is a `Record<string, SchemaEntry>`. Each entry can be a bare
type alias (`'string'`) or an object with `term` / `def` / `article` /
`required` / `default` / `description` / `plural`. Three helpers compose
the standard caller > frontmatter > schema-default chain:

```ts
import { mergeValues, schemaDefaults, missingRequired } from 'markdsl';

const schema = {
  customer: { term: 'Customer', required: true },
  state:    { default: 'Delaware' },
};

const merged = mergeValues(
  schemaDefaults(schema),     // { state: 'Delaware' }
  { state: 'New York' },      // frontmatter override
  { customer: 'Acme' },       // caller override
);
// → { customer: 'Acme', state: 'New York' }

missingRequired(merged, schema);          // → []
missingRequired({ state: 'NY' }, schema); // → ['customer']
```

Schema-aware readers:

```ts
import { termLabel, termArticle } from 'markdsl';

const schema = { party: { term: 'Party', article: 'a' } };

termLabel('party',   schema);  // 'Party'
termLabel('parties', schema);  // 'Parties'   — bidirectional + pluralize
termArticle('party', schema);  // 'a'
```

## Markers (`{{...}}`)

Build a registry of prefix handlers. Each handler returns markdown text
that pandoc will pick up later.

```ts
import { substituteMarkers, type MarkerRegistry } from 'markdsl';

const registry: MarkerRegistry = {
  prefixes: {
    // {{=key}} — bare value substitution
    '=': (key, ctx) => String(ctx.values[key.trim()] ?? '___'),
    // {{!Term}} — inline-styled, no parens
    '!': (rest) => `***${rest}***`,
    // {{key}} — fallback (no prefix)
    '':  (key, ctx) => `**${ctx.values[key] ?? key}**`,
  },
};

substituteMarkers(
  'Dear {{name}}, your {{=plan}} is {{!Active}}.',
  registry,
  { values: { name: 'Reader', plan: 'Pro' } },
);
// → 'Dear **Reader**, your Pro is ***Active***.'
```

The handler context (`ctx`) gives you `values`, `schema`, and `next` —
the source character right after `}}`, useful for trailing-dot swallow
and similar context-sensitive rendering.

For richer marker grammars (article prefixes like `{{the_key}}`,
case signals like `{{The_key}}`, all-caps detection), use the parse +
compose helpers:

```ts
import { parseMarker, pickArticle, emitDefine } from 'markdsl';

// Inside a handler:
const p = parseMarker(rest);
// p.key         — post-prefix lowercase key
// p.article     — 'the' / 'a' / 'an' / null
// p.capArticle  — true if the article was uppercase ({{The_x}})
// p.capContent  — true if the content first letter is uppercase
// p.upper       — true if the key was all uppercase
```

## Pandoc

```ts
import { runPandoc } from 'markdsl';

const ast = runPandoc('# Heading\n\nBody **bold** prose.');
// ast.blocks → Pandoc JSON AST: [Header, Para, …]
```

Async WASM variant for browser:

```ts
import { runPandocWasm } from 'markdsl';
const ast = await runPandocWasm(body);
```

`pandoc-wasm` is an optional peer dep; install it explicitly when you
need it. With `file:` / linked installs the dynamic `import('pandoc-wasm')`
inside markdsl can miss the consumer's `node_modules` — pre-resolve
and inject the convert function:

```ts
import { runPandocWasm, type PandocWasmConvert } from 'markdsl';
import * as pandocWasm from 'pandoc-wasm';
const ast = await runPandocWasm(body, pandocWasm.convert as PandocWasmConvert);
```

## docx renderer (`markdsl/docx`)

Generic Pandoc-AST → `.docx` Buffer with extension points for
DSL-specific blocks/markers/spans. Built on `docx`@9.6.1 with a
runtime font-filename sanitizer (no upstream patches needed).

```ts
import { renderMarkdownToBuffer } from 'markdsl/docx';

const buf = await renderMarkdownToBuffer(`---
title: A Memo
---

# Hello

Standard markdown — **bold** *italic* and lists:

- item one
- item two
`);
// Buffer is a valid .docx — write to disk or return from a handler.
```

Plug DSL behavior in via `DocxRenderConfig`:

```ts
import {
  renderMarkdownToBuffer,
  TextRun, fieldTable, spacer,
  type DocxRenderConfig,
} from 'markdsl/docx';
import { substituteMarkers } from 'markdsl';

const config: DocxRenderConfig = {
  // {{...}} marker emitter — the legalese-style 5-prefix grammar
  // is one obvious choice; here we keep it short.
  markerEmitter: (inner, bold, italic, out, ctx) => {
    out.push(new TextRun({
      text: String(ctx.values[inner] ?? `[${inner}]`),
      bold, italics: italic,
    }));
  },

  // ```fields / ```sig / ```grid → docx Table
  fencedHandlers: {
    fields: (content, values) => [
      spacer(),
      fieldTable(values, [{ label: 'Customer', key: 'customer' }]),
      spacer(),
    ],
  },

  // [text]{.smallcaps} and [text]{.underline} are built-in;
  // register custom Span classes here.
  spanHandlers: {
    cite: (runs) => runs,
  },

  // resolveText runs on the front-matter title before assembly so
  // markers like `MEMO TO {{=COMPANY}}` resolve.
  resolveText: (text, ctx) => substituteMarkers(text, registry, ctx),
};

const buf = await renderMarkdownToBuffer(src, { config });
```

**Important**: when constructing `TextRun` / `Paragraph` / `Table`
yourself in a custom handler, import them from `markdsl/docx`, not
`'docx'` directly. With `file:` / linked installs each project gets
its own `node_modules/docx`; cross-instance runs fail docx's
`instanceof` checks during serialization (you'll see
`<rootKey>w:r</rootKey>` instead of `<w:r>...</w:r>`). The
`markdsl/docx` barrel re-exports `'docx'` so consumers and the
renderer stay on the same instance.

### Bundled fonts

`markdsl/fonts/` ships open-licensed serif families (EB Garamond,
Crimson Pro, Libre Baskerville, PT Serif, Source Serif). Set
`style.font:` in front-matter and the renderer embeds the TTF so the
output renders correctly on machines without the font installed:

```yaml
---
title: Serif memo
style:
  font: EB Garamond
---
```

## See also

- [legalese](https://github.com/EvolvingPrograms/legalese) — the docx
  consumer (NDAs, agreements, signature blocks, defined-term grammar).
- [texdown](https://github.com/EvolvingPrograms/texdown) — the LaTeX
  consumer (academic papers, arxiv-two-column template).

Toy DSLs under `src/integration/` (recipedown, postcard) keep the
public API honest and double as starting templates for new consumers.

## Development

```bash
bun install
bun run typecheck
bun test
```

Tests are colocated (`file.ts` + `file.test.ts`). Each subdirectory
has its own README documenting the contract it owns.
