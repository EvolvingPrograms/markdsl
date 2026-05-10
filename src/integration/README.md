Up: [../README.md](../README.md)

# `integration/` — end-to-end DSL examples

Each subdirectory is a tiny, complete DSL built on top of markdsl —
both a reference implementation showing how a consumer wires the
framework together and an integration test that exercises every stage
of the pipeline against real markdown.

These DSLs are deliberately whimsical (recipes, postcards) so they
don't compete with legalese or texdown for the "serious" examples.
The point is that the framework is generic enough to host them.

## DSLs

- [`recipedown/`](./recipedown/) — markdown for recipes. Fenced
  `ingredients` and `steps` blocks, `.tip` div-class for asides,
  `{{=key}}` value substitutions. Output: HTML strings.
- [`postcard/`](./postcard/) — minimal: a salutation, body, and
  signoff with `{{=to}}` / `{{=from}}` substitutions. No fenced
  blocks, no divs. Output: plain text. Demonstrates the smallest
  viable consumer.

## What these tests prove

Run together they exercise every framework module:

| Stage | Recipedown | Postcard |
|---|---|---|
| frontmatter | ✓ schema + values | ✓ values |
| schema/values merging | ✓ defaults | — |
| markers (registry) | ✓ `=` + fallback | ✓ `=` |
| pandoc parse | ✓ via runPandoc | ✓ via runPandoc |
| ast/walker | ✓ blocks + inlines | ✓ blocks + inlines |
| render/dispatchFenced | ✓ ingredients + steps | — |
| render/dispatchDiv | ✓ .tip | — |
| pipeline | ✓ process() end-to-end | ✓ process() end-to-end |

If a refactor breaks one of the integration tests, that's the contract
saying "this stage no longer behaves the way consumers depend on" —
the unit tests in each module wouldn't catch it because they test in
isolation.
