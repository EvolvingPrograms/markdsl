// Composition helpers — string transforms that take parsed marker
// signals + a resolved label and produce display text. These are
// *opt-in conveniences*: handlers that don't want them just don't
// import them. The framework ships them because two patterns recur
// across legal, academic, and reference DSLs:
//
//   1. Parenthetical-define:   `<expansion> (the *"Term"*)`
//   2. Inline-styled:          `<article> *"Term"*`  (no parens)
//
// Both show up in legalese and would show up in any DSL that introduces
// defined terms. Including these here avoids each consumer reinventing
// markdown emphasis token plumbing.

import { pickAOrAn, cap } from '../schema/terms';
import type { ArticlePrefix, MarkerParts } from './parse';

/** Resolve which article to actually emit, given a requested article
 *  and the resolved label. `the` is verbatim; `a`/`an` auto-flip by
 *  the label's leading sound. Returns null if no article was requested. */
export function pickArticle(
  label: string,
  requested: ArticlePrefix | null,
): ArticlePrefix | null {
  if (requested === null) return null;
  if (requested === 'the') return 'the';
  // Both `a` and `an` go through pickAOrAn — the author's choice in the
  // marker (`a_X` vs `an_X`) is treated as a hint, but the actual
  // article is determined by the resolved label's leading sound.
  return pickAOrAn(label);
}

/** Apply case transforms based on parser signals.
 *    parts.upper       → uppercase everything
 *    parts.capContent  → capitalize first letter
 *  Otherwise pass-through. Note `parts.capContent` is implied by
 *  `parts.upper` (an all-caps key starts with an uppercase letter), so
 *  upper takes precedence. */
export function applyTextCase(text: string, parts: MarkerParts): string {
  if (parts.upper) return text.toUpperCase();
  if (parts.capContent) return cap(text);
  return text;
}

const LQ = '“'; // “
const RQ = '”'; // ”

/** Emit a parenthetical-define: `(the *"Term"*)` or `(*"Term"*)` if no
 *  article. The label is wrapped in markdown `***` (bold + italic) and
 *  curly quotes — pandoc with `+smart` parses this back into nested
 *  Strong/Emph/Quoted nodes downstream.
 *
 *  Article-in-parens convention: lowercase even at sentence start
 *  (`An initial term... (an "Term")`) — that's the legal-drafting
 *  convention, and consumers wanting different behavior emit their own. */
export function emitDefine(
  label: string,
  article: ArticlePrefix | null,
): string {
  const lhs = article ? `(${article} ` : '(';
  return `${lhs}***${LQ}${label}${RQ}***)`;
}

/** Emit inline-styled (no parens): `<article> *"Term"*`. Used for
 *  in-prose definitions where the parenthetical would be redundant.
 *  Optional `capArticle` capitalizes the article (sentence-start). */
export function emitInline(
  label: string,
  article: ArticlePrefix | null,
  capArticle = false,
): string {
  const term = `***${LQ}${label}${RQ}***`;
  if (!article) return term;
  return `${capArticle ? cap(article) : article} ${term}`;
}
