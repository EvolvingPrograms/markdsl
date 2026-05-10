Up: [../README.md](../README.md)

# `pandoc/` — markdown → Pandoc AST

The pipeline runs marker substitution first (so `{{...}}` is gone before
pandoc sees the source), then hands the resulting plain markdown to
pandoc to produce the AST every renderer consumes.

Two implementations:

- **`runPandoc`** — system pandoc shell-out. Node-only (`execSync`).
  The default for CLI usage; near-instant on a typical machine.
- **`runPandocWasm`** — pandoc-wasm peer dependency. Runs in browsers
  and Node without a system pandoc install. ~56 MB on disk; load when
  needed.

Both produce the same `PandocAst` shape, so callers can swap engines
freely.

## Files

- [`types.ts`](./types.ts) — `PandocAst`, `PandocBlock`, `PandocInline`.
- [`runPandoc.ts`](./runPandoc.ts) — system pandoc engine.
- [`runPandoc.test.ts`](./runPandoc.test.ts) — tests (require system pandoc).
- [`runPandocWasm.ts`](./runPandocWasm.ts) — WASM engine.
- [`runPandocWasm.test.ts`](./runPandocWasm.test.ts) — tests (skipped if
  pandoc-wasm isn't installed).
- [`index.ts`](./index.ts) — barrel.

## Pandoc flags

Both engines pass the same flags to pandoc, building the format string:

```
markdown
  +fancy_lists           a. b. c. lettered ordered lists
  +smart                 curly quotes, en/em dashes, ellipses
  +bracketed_spans       [text]{.class} for underline / smallcaps / etc.
  -tex_math_dollars      `$` is literal — markdown markers like `{{$X}}`
                         don't get eaten as inline math.
  -tex_math_single_backslash
```

The `tex_math_*` flags are off because legalese (and any DSL using `$`
as a marker prefix) needs literal `$` in the source. Renderers that
actually want LaTeX math can build their own pandoc invocation; the
flags here are the framework's safe default.

## Choosing an engine

The pipeline factory accepts a `parse` callback so consumers pass
whichever engine they want:

```ts
import { createPipeline } from 'markdsl';
import { runPandoc, runPandocWasm } from 'markdsl/pandoc';

const node = createPipeline({ parse: runPandoc, ... });          // CLI
const browser = createPipeline({ parse: runPandocWasm, ... });   // browser
```

`pandoc-wasm` is listed as an optional peer dependency — it's only
required when a consumer imports `runPandocWasm`. Node consumers using
the system engine never pay the install cost.

## Why marker substitution runs BEFORE pandoc

The framework's marker resolver emits markdown text (with `*italic*`,
`**bold**`, `***bold-italic***`, curly quotes, embedded HTML for
small-caps). Pandoc then parses the substituted source naturally — no
AST manipulation, no special-case nodes for markers. Whatever the
resolved text looks like, that's what shows up in the AST.

The cost: marker output has to be valid markdown. Handlers can emit
arbitrary markdown emphasis and inline HTML, but they can't produce
anything pandoc wouldn't otherwise understand. In practice this is the
right constraint — it keeps the marker grammar honest.
