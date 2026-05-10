# markdsl

A toolkit for building markdown DSLs that parse to typed structures and emit to
arbitrary backends.

You declare:

- a **schema** of fields the DSL recognizes,
- a **marker registry** for `{{...}}` substitutions,
- **fenced-block parsers** (`field`/`grid`/`equation`/`figure`/whatever your
  DSL needs) that turn YAML inside fences into typed structures,
- **div-class handlers** for `::: {.className}` block attributes,
- and an **AST renderer** that walks Pandoc inline/block nodes and emits your
  output type.

You get back a pipeline that takes a markdown source and per-deal values and
produces your output (a `Buffer`, a TeX string, a React tree — whatever).

The two reference consumers:

- **legalese** (this project's parent) — emits `.docx` for legal documents.
- **texdown** (planned) — emits LaTeX for academic papers.

## Pipeline

```
source string
  ↓ splitFrontMatter            (generic)
{ meta, body }
  ↓ resolveValues + missingRequired   (schema-driven, generic)
{ meta, body, values, missing }
  ↓ substituteMarkers           (uses your marker registry)
{ meta, body′, values }         (markers expanded inline)
  ↓ runPandoc                   (generic — system or WASM)
{ meta, ast, values }
  ↓ render                      (uses your AST/fenced/div registry)
→ Out
```

Every stage is overridable. The default pipeline orchestrates them in this
order; consumers can short-circuit at any stage (e.g. stop after the AST stage
if they want the raw tree as JSON).

## Layout

```
src/
  index.ts                   public barrel
  pipeline.ts                createPipeline factory
  pipeline.test.ts
  frontmatter.ts             splitFrontMatter
  frontmatter.test.ts
  schema/                    schema + value resolution + term helpers
  markers/                   marker grammar + registry + substituter
  pandoc/                    runPandoc / runPandocWasm + AST types
  ast/                       AST visitor with default fallthroughs
  render/                    render contract types (per-DSL backends ship
                             their own emitters that satisfy these)
```

Tests are colocated (`file.ts` + `file.test.ts`). Each subdirectory has a
README documenting the contract it owns.

## Development

```bash
bun install
bun test          # run the full suite
bun run typecheck # tsc --noEmit
```

## Status

Pre-1.0. Building the contracts module-by-module before the legalese rewrite.
