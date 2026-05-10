Up: [../README.md](../README.md)

# `ast/` — Pandoc AST visitor

A small visitor that walks a Pandoc tree and dispatches per-node-type
to consumer-supplied handlers. Generic over **block-output** type and
**inline-output** type so consumers can emit whatever shape their
backend wants — `docx-js` `Paragraph`/`TextRun`, plain LaTeX strings,
React elements, etc.

The framework knows how to walk the tree and where to look for handlers.
It does NOT know:

- How to emit text (Str / Space / SoftBreak / LineBreak — consumer registers).
- What styles wrapper nodes apply (Strong / Emph / Underline — consumer
  registers if it cares; default is "recurse, drop the wrapper").
- The shape of the output type (consumer parameterizes).

## Files

- [`types.ts`](./types.ts) — `RenderContext`, `BlockHandler`,
  `InlineHandler`, `AstHandlers`, `AstWalker`.
- [`walker.ts`](./walker.ts) — `createWalker(handlers, ctx)`.
- [`walker.test.ts`](./walker.test.ts) — visitor tests with synthetic
  string-emitting handlers.
- [`index.ts`](./index.ts) — barrel.

## The contract

```ts
interface RenderContext<Ext = undefined> {
  values: Values;
  schema: Schema | undefined;
  ext: Ext;     // DSL-defined extension state (font, indent, section, …)
}

type BlockHandler<B, I, Ext = undefined> = (
  node: PandocBlock,
  ctx: RenderContext<Ext>,
  walk: AstWalker<B, I, Ext>,
) => B[];

type InlineHandler<B, I, Ext = undefined> = (
  node: PandocInline,
  ctx: RenderContext<Ext>,
  walk: AstWalker<B, I, Ext>,
) => I[];

interface AstHandlers<B, I, Ext = undefined> {
  blocks?:  Record<string, BlockHandler<B, I, Ext>>;
  inlines?: Record<string, InlineHandler<B, I, Ext>>;
  /** Called when no block handler is registered. Default recurses
   *  children when the node is a known wrapper (Div, BlockQuote);
   *  returns [] otherwise. */
  unknownBlock?:  BlockHandler<B, I, Ext>;
  /** Same for inlines. Default recurses children for wrapper inlines
   *  (Strong, Emph, Underline, Strikeout, Span, Quoted); returns []
   *  for leaves (Str, Code, RawInline, etc.) so missing leaf handlers
   *  fail loudly rather than silently dropping content — register a
   *  catch-all `unknownInline` to override. */
  unknownInline?: InlineHandler<B, I, Ext>;
}

interface AstWalker<B, I, Ext = undefined> {
  block(node: PandocBlock):    B[];
  inline(node: PandocInline):  I[];
  blocks(nodes: PandocBlock[]):  B[];
  inlines(nodes: PandocInline[]): I[];
}

function createWalker<B, I, Ext = undefined>(
  handlers: AstHandlers<B, I, Ext>,
  ctx: RenderContext<Ext>,
): AstWalker<B, I, Ext>;
```

## Why two output types

Block-level output (a `docx` `Paragraph`, a paragraph of LaTeX, a
`<p>`-element) is a different shape from inline output (a `docx`
`TextRun`, a span of LaTeX, a `<span>`). Forcing one type for both
either loses precision (`unknown[]`) or forces every handler to
construct nested wrappers manually.

Two type params keep the handlers honest: a `Para` handler returns
`B[]` and is given a `walk.inlines(...)` it can call to convert its
children, getting back `I[]`. Composition is type-checked at every
boundary.

## Default fallthroughs

When no handler matches a node:

- **Wrapper inlines** (Strong, Emph, Underline, Strikeout, Span, Quoted)
  — by default the walker recurses into the children and returns
  whatever they produce. Handlers that want to apply styling override
  the specific node type.
- **Wrapper blocks** (Div, BlockQuote) — same: recurse children blocks.
- **Leaf inlines** (Str, Code, RawInline, Math, Note, Link, Image) and
  **leaf blocks** (CodeBlock, RawBlock, HorizontalRule) — by default
  the walker returns `[]`. The consumer must register a handler if it
  wants the content rendered. This is intentional: silently dropping
  content is the worst failure mode, so we make missing leaf handlers
  visible (empty output) rather than guessing.

Consumers can override either default with `unknownBlock` /
`unknownInline` for catch-all behavior.

## Recursion via the walker, not direct calls

Handlers receive `walk` rather than calling other handlers directly.
This lets the framework intercept every traversal — useful for tracing,
context threading, or overriding behavior in tests. In practice:

```ts
const Para: BlockHandler<Block, Inline> = (node, ctx, walk) => {
  const inlines = walk.inlines(node.c as PandocInline[]);
  return [{ kind: 'para', children: inlines }];
};
```

If the handler called `inlinesToOutputs(...)` directly, the walker
couldn't trace or override that call.

## Tests

`walker.test.ts` covers dispatch, recursion, default fallthroughs (both
wrapper-recurse and leaf-empty), unknown-handler catch-alls, and a few
realistic compositions. The synthetic backend in tests emits string
arrays so test assertions can compare straight strings — no docx, no
LaTeX, no actual format.
