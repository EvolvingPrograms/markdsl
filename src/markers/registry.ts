// Marker registry — the data structure consumers populate to tell
// substituteMarkers how to render each `{{...}}` form.

import type { Schema, Values } from '../schema/types';

/** Context passed to every marker handler. Intentionally narrow — the
 *  handler reads `values` / `schema` for resolution, peeks at `next`
 *  for context-sensitive rendering (trailing-dot swallow, sentence-end
 *  detection), and inspects `rawInner` if it needs to see the prefix
 *  itself. */
export interface MarkerContext {
  /** Merged value map (caller > frontmatter > schema-defaults). */
  values: Values;
  /** Schema as declared in front-matter; undefined if none. */
  schema: Schema | undefined;
  /** Source character immediately after the marker's closing `}}`,
   *  or `undefined` if the marker is at end of body. Handlers like
   *  legalese's `{{=key}}` use this to swallow a duplicate trailing
   *  period when the value already ends in one ("Spellcraft Inc.."
   *  → "Spellcraft Inc."). */
  next: string | undefined;
  /** The full inner text of the marker (between `{{` and `}}`),
   *  trimmed but with the prefix character intact. Handlers that want
   *  to inspect the prefix themselves can; most handlers won't bother
   *  since the dispatcher already stripped it before calling. */
  rawInner: string;
}

/** A marker handler — turns the post-prefix inner text into rendered
 *  markdown. The output is markdown so pandoc can pick up emphasis
 *  (`*x*`, `**x**`), quotes, and any embedded HTML downstream.
 *
 *  Generic over the context type so DSLs that want to thread extra
 *  state (font, indent, current section) can extend `MarkerContext`. */
export type MarkerHandler<Ctx extends MarkerContext = MarkerContext> = (
  rest: string,
  ctx: Ctx,
) => string;

/** Marker dispatch table. Keys are single characters (the prefix); the
 *  empty string `''` is the fallback called when no prefix matches.
 *
 *  A registry without a fallback leaves unknown markers in place — a
 *  useful default during DSL development so unhandled markers are
 *  visible rather than silently dropped. */
export interface MarkerRegistry<Ctx extends MarkerContext = MarkerContext> {
  prefixes: Record<string, MarkerHandler<Ctx>>;
}

/** Tiny factory for handler registration. Mostly here for symmetry with
 *  `defineFenced` / `defineDiv` (coming later) and to give consumers a
 *  named hook if we add validation/wrapping in the future. */
export function defineMarker<Ctx extends MarkerContext = MarkerContext>(
  handler: MarkerHandler<Ctx>,
): MarkerHandler<Ctx> {
  return handler;
}
