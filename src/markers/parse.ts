// Parse a marker's inner text into structural parts. Pure string
// operations — no schema lookup, no value resolution, no opinions
// about what a "missing" or "uppercase" key MEANS. The parser just
// recognizes shapes; handlers decide what to do with them.
//
// Three composable pieces:
//   - stripArticlePrefix    : pulls `the_` / `a_` / `an_` (any case) off the front
//   - analyzeCaseSignals    : reads the leading capitalization
//   - parseMarker           : the convenience aggregate
//
// Consumers that don't use article semantics call only
// `analyzeCaseSignals`. Consumers with completely different marker
// shapes ignore both and parse however they like.

/** Identified article prefix. Lowercase form even when the source had
 *  it capitalized — the case is preserved separately. */
export type ArticlePrefix = 'the' | 'a' | 'an';

/** Result of stripping an article prefix off the front of a marker. */
export interface StripArticleResult {
  /** The article found, lowercase, or null if no `the_` / `a_` / `an_`
   *  prefix was present. */
  article: ArticlePrefix | null;
  /** True when the article prefix in the source was capitalized
   *  (`The_`, `A_`, `An_`). Sentence-start signal — handlers typically
   *  capitalize the article (or its substitute) in the output. */
  capArticle: boolean;
  /** The remaining text with the prefix removed. */
  rest: string;
}

const ARTICLE_RE = /^(the|a|an)_/i;

/** Pull a `the_` / `a_` / `an_` prefix (any case) off the front of an
 *  identifier. The returned `article` is lowercased; `capArticle`
 *  preserves the source casing as a sentence-start hint. */
export function stripArticlePrefix(inner: string): StripArticleResult {
  const m = inner.match(ARTICLE_RE);
  if (!m) return { article: null, capArticle: false, rest: inner };
  const prefix = m[0];
  return {
    article: prefix.slice(0, -1).toLowerCase() as ArticlePrefix,
    capArticle: /^[A-Z]/.test(prefix),
    rest: inner.slice(prefix.length),
  };
}

/** Result of analyzing the leading case of a marker key. */
export interface CaseSignals {
  /** Key starts with an uppercase letter (`Term`, `Some_Key`).
   *  Conventional "capitalize the rendered label" signal. */
  capContent: boolean;
  /** Key is all-uppercase (`TERM`, `SOME_KEY`). Conventional
   *  "uppercase everything" signal. */
  upper: boolean;
}

/** Inspect the leading capitalization of a marker key. Reports whether
 *  the author intends a capitalize-first or fully-uppercase rendering;
 *  what to DO with that information is up to the handler. */
export function analyzeCaseSignals(key: string): CaseSignals {
  return {
    capContent: /^[A-Z]/.test(key),
    upper: /^[A-Z][A-Z0-9_]*$/.test(key),
  };
}

/** Aggregate of the parse pieces above plus the lookup key normalized
 *  to lowercase. The `key` field is what handlers pass to schema/value
 *  lookups (which are case-insensitive); the original-case info is
 *  preserved on `capContent` / `upper` / `capArticle`. */
export interface MarkerParts extends CaseSignals, StripArticleResult {
  /** Lowercased lookup key. */
  key: string;
  /** The original (post-trim) inner text — useful for error messages. */
  raw: string;
}

/** Convenience: run the full parse pipeline on a marker's inner text
 *  (after the dispatch prefix has already been stripped). Returns
 *  every signal a handler could want, normalized.
 *
 *  Whitespace is trimmed at the boundary; markers like `{{ $  the_X }}`
 *  parse the same as `{{$the_X}}`. */
export function parseMarker(inner: string): MarkerParts {
  const raw = inner.trim();
  const { article, capArticle, rest } = stripArticlePrefix(raw);
  const { capContent, upper } = analyzeCaseSignals(rest);
  return {
    raw,
    key: rest.toLowerCase(),
    article,
    capArticle,
    capContent,
    upper,
    rest,
  };
}
