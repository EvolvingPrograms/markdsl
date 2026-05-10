Up: [../README.md](../README.md)

# `render/` — fenced-block + Div-class dispatchers

Helpers consumers use to wire up the two block patterns Pandoc gives
us beyond plain content:

- **Fenced code blocks with a language tag** — \`\`\`fields, \`\`\`sig,
  \`\`\`grid, \`\`\`equation, \`\`\`figure. The DSL author wants a
  function-per-language with typed YAML parsing.
- **Divs with class attributes** — `::: {.center}`, `::: {.title}`,
  `::: {.theorem}`, `::: {.proof}`. The author wants per-class
  styling/transformation on the contained block children.

Both patterns are just Pandoc node types (`CodeBlock` and `Div`) with
their classes carrying the routing information. This module gives
typed dispatchers so consumers don't write the same class-matching
boilerplate per-DSL.

## Files

- [`types.ts`](./types.ts) — `DivAttrs`, `CodeBlockAttrs`,
  `FencedHandler`, `DivClassHandler`.
- [`attrs.ts`](./attrs.ts) — `parseDivAttrs(node)`,
  `parseCodeBlockAttrs(node)`. Pull the Pandoc shape apart into a
  named struct (the JSON shape is positional).
- [`attrs.test.ts`](./attrs.test.ts) — attrs parsing.
- [`dispatch.ts`](./dispatch.ts) — `dispatchFenced(handlersByLang, fallback)`,
  `dispatchDiv(handlersByClass, fallback)`. Each takes a class-keyed
  handler map and returns a `BlockHandler` ready to plug into
  `AstHandlers.blocks`.
- [`dispatch.test.ts`](./dispatch.test.ts) — dispatch behavior.
- [`index.ts`](./index.ts) — barrel.

## Fenced-block contract

```ts
interface FencedHandler<B, I, T = unknown, Ext = undefined> {
  /** Parse the block's content (YAML or plain text) into a typed
   *  structure. Pure — separates parsing from rendering so the same
   *  handler can drive multiple backends. */
  parse: (content: string) => T;
  /** Render the parsed structure to block outputs. Receives the
   *  walker so it can recurse into any inline children if needed. */
  render: (
    parsed: T,
    ctx: RenderContext<Ext>,
    walk: AstWalker<B, I, Ext>,
  ) => B[];
}

dispatchFenced<B, I, Ext>(
  handlersByLang: Record<string, FencedHandler<B, I, any, Ext>>,
  fallback?: BlockHandler<B, I, Ext>,
): BlockHandler<B, I, Ext>;
```

`dispatchFenced` produces a `BlockHandler` that:

1. Checks the `CodeBlock` node's first class; if it matches a key in
   the handler map, runs `parse` then `render`.
2. Otherwise calls `fallback` (or returns `[]`).

A typical consumer:

```ts
import { dispatchFenced, defineFenced } from 'markdsl';

const fenceds = dispatchFenced({
  fields: defineFenced({
    parse:  (yaml) => parseFieldsYaml(yaml),
    render: (rows, ctx) => [renderFieldsTable(rows, ctx.values)],
  }),
  sig:   defineFenced({ /* ... */ }),
  grid:  defineFenced({ /* ... */ }),
});

const handlers: AstHandlers<Block, Inline> = {
  blocks: { CodeBlock: fenceds, /* ... */ },
};
```

## Div-class contract

Divs are trickier than fenced blocks because a single Div can carry
multiple classes (`::: {.center .pageBreak .indent}`). The convention
here:

```ts
interface DivClassHandler<B, I, Ext = undefined> {
  /** Render this Div's children. Receives the children verbatim plus
   *  the parsed attrs; the handler decides whether to walk children
   *  normally, modify them, extract them to a different section, etc. */
  render: (
    children: PandocBlock[],
    attrs: DivAttrs,
    ctx: RenderContext<Ext>,
    walk: AstWalker<B, I, Ext>,
  ) => B[];
}

dispatchDiv<B, I, Ext>(
  handlersByClass: Record<string, DivClassHandler<B, I, Ext>>,
  fallback?: BlockHandler<B, I, Ext>,
): BlockHandler<B, I, Ext>;
```

`dispatchDiv` picks the **first matching class** and runs that
handler. Multiple-class Divs need the consumer to design class
ordering or compose handlers themselves — the framework doesn't
prescribe a composition strategy because consumers have widely
different needs (legalese: `.center` modifies alignment AND
`.pageBreak` adds a break — both apply; texdown: `.theorem` is an
exclusive environment that overrides `.center`).

Consumers wanting multi-class composition either:

1. Write their own block handler that walks the class list manually
   (using `parseDivAttrs` from `attrs.ts`).
2. Compose `dispatchDiv` with custom logic in a wrapper handler.

The framework doesn't try to be clever here.

## Why fenced/div helpers and not full DSL fixtures

A previous design draft put the actual fields/sig/grid block parsers
upstream as opt-in helpers (the same way `terms.ts` ships
`pluralizeLabel`). On reflection: the YAML shapes and rendering
strategies are too DSL-specific. legalese's `sig` block has tall-row
support and double-sided header parsing; another DSL might want a
totally different signature concept. Shipping legalese's parsers
upstream would either constrain everyone to one shape or fork into
unmaintained variants.

What stays upstream: the dispatcher + the attrs parsers. Each
consumer writes their own `parse` / `render` per fenced language.
That code is ~100 lines per handler — small enough to live downstream.
