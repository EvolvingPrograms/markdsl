Up: [../README.md](../README.md)

# `markers/` — `{{...}}` marker grammar + dispatch

The framework knows the **syntax** of markers (`{{...}}` braces around an
arbitrary inner string) and **dispatches** to a per-prefix handler. It
does *not* know anything about defined-term forms, articles, case
signals, or marker semantics. Those are entirely up to the DSL
consumer's handlers.

This separation is what lets legalese register `$`/`=`/`!`/`^` for
defined-term operations while a hypothetical Texdown registers `@` for
citations and `#` for cross-references. They coexist by registering
different prefix maps.

## Files

- [`registry.ts`](./registry.ts) — `MarkerHandler`, `MarkerRegistry`,
  `MarkerContext`, `defineMarker` factory.
- [`registry.test.ts`](./registry.test.ts) — registry contract tests.
- [`substitute.ts`](./substitute.ts) — `substituteMarkers(body, registry, ctx)`
  walks the source for `{{...}}` patterns and dispatches.
- [`substitute.test.ts`](./substitute.test.ts) — end-to-end substitution
  tests with synthetic registries.
- [`parse.ts`](./parse.ts) — `stripArticlePrefix`, `analyzeCaseSignals`,
  `parseMarker` aggregate. Turns marker text into a structural shape so
  handlers don't reimplement article / case-signal parsing.
- [`parse.test.ts`](./parse.test.ts) — parser piece-by-piece tests.
- [`compose.ts`](./compose.ts) — `pickArticle`, `applyTextCase`,
  `emitDefine`, `emitInline`. Composition helpers for the
  parenthetical-define and inline-styled patterns. Opt-in.
- [`compose.test.ts`](./compose.test.ts) — composition tests.
- [`index.ts`](./index.ts) — barrel.

## The contract

```ts
type MarkerHandler<Ctx = MarkerContext> = (rest: string, ctx: Ctx) => string;

interface MarkerContext {
  values: Values;            // merged values
  schema: Schema | undefined;
  /** Source character immediately after the marker's `}}`, useful for
   *  context-sensitive rendering (e.g. trailing-dot swallow). */
  next: string | undefined;
  /** The full original `inner` (before prefix stripping) — handlers
   *  that want to inspect the prefix for themselves can. */
  rawInner: string;
}

interface MarkerRegistry {
  /** Map of single-character prefix → handler. The empty key '' is the
   *  fallback used when the inner text doesn't start with any
   *  registered prefix character. */
  prefixes: Record<string, MarkerHandler>;
}
```

`substituteMarkers` walks every `{{...}}` match in the body and:

1. Trims the inner text.
2. Looks at the first character; if it's a registered prefix, strip it
   and call the handler with the remaining text (also trimmed).
3. Otherwise call the registered fallback (`''` key), if any.
4. If neither is registered, the marker is left in place verbatim — a
   useful default for partial setups.

The handler returns markdown text. Markers can produce styling via
markdown emphasis (`*italic*`, `**bold**`, `***bold-italic***`) which
pandoc parses into proper Emph/Strong nodes downstream. Handlers that
need richer output (like custom HTML spans for small-caps) can emit
raw HTML — pandoc passes it through.

## What the framework does NOT decide

- **Prefix names.** `$`, `=`, `!`, `^` are legalese's choice. Texdown
  could pick anything — single-character prefixes are the only constraint.
- **Article / case parsing.** Handlers do their own splitting of the
  inner text. The framework gives helpers in `schema/` (like
  `pickAOrAn`, `cap`) but doesn't impose a parsing contract.
- **Schema field reads.** Whether a handler looks at `entry.def`,
  `entry.article`, or some custom field is up to the handler.
- **Semantics of "missing".** Whether a missing value renders blank, a
  fill-in line, or an error is the handler's call.

## Why prefix dispatch and not regex-per-handler

Two reasons:

1. **No collision possible.** If three handlers each registered their own
   regex, two regexes could match the same input differently — debugging
   that is awful. With first-character dispatch the registry is a
   straight lookup table.
2. **Cheap.** One regex pass over the body, one map lookup per match.

The cost: handlers have to do their own further parsing of the rest of
the inner text. That's what handlers are for.

## Tests

`registry.test.ts` covers the data structure and `defineMarker` factory.
`substitute.test.ts` covers the walker — prefix matching, fallback,
unknown-marker pass-through, the `next` and `rawInner` context fields,
and round-trip composition with real (synthetic) handlers.

End-to-end coverage of legalese's actual marker semantics lives in the
legalese repo, not here — markdsl never sees those handlers.
