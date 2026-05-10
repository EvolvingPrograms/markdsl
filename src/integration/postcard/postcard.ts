// Postcard — the smallest viable markdsl consumer. Frontmatter
// supplies `to:` / `from:` values; the body is regular markdown with
// `{{=to}}` / `{{=from}}` substitutions. Output is a plain-text
// rendering, one block per paragraph.
//
// What this DSL exercises:
//   - frontmatter splitting
//   - merge of frontmatter values
//   - `=` marker registry (single handler, no fallback)
//   - pandoc parse
//   - AST walker with minimum-viable handlers (Para, Str, Space, etc.)
//
// What it deliberately does NOT exercise: schema, fenced blocks, divs,
// formatting (bold/italic), Ext threading. That's the point — postcard
// is the floor of what the framework asks of a consumer.

import { createPipeline } from '../../pipeline';
import { defineMarker } from '../../markers/registry';
import { runPandoc } from '../../pandoc/runPandoc';
import { lookupValue } from '../../schema/lookup';
import type { AstHandlers } from '../../ast/types';
import type { PandocInline } from '../../pandoc/types';

// Output type: plain-text strings, one per paragraph.
type B = string;
// Inline output: plain-text strings, joined into the block above.
type I = string;

const handlers: AstHandlers<B, I> = {
  blocks: {
    Para: (n, _ctx, w) => [w.inlines(n.c as PandocInline[]).join('')],
  },
  inlines: {
    Str: (n) => [n.c as string],
    Space: () => [' '],
    SoftBreak: () => [' '],
    LineBreak: () => ['\n'],
  },
};

export const postcard = createPipeline<B, I>({
  markers: {
    prefixes: {
      // {{=key}} → look up the value and emit it verbatim.
      '=': defineMarker((rest, ctx) => String(lookupValue(rest, ctx.values) ?? '')),
    },
  },
  ast: handlers,
  parse: runPandoc,
});

/** Render a postcard source to a single plain-text string. Paragraphs
 *  are joined with blank lines for that authentic "handwritten note"
 *  rhythm. */
export async function renderPostcard(
  source: string,
  values: Record<string, unknown> = {},
): Promise<string> {
  const result = await postcard.process(source, { values });
  return result.output.join('\n\n');
}
