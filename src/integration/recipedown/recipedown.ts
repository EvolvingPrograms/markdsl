// Recipedown — markdown for recipes. Front-matter declares the recipe
// metadata (title, servings, prep/cook times); the body has fenced
// `ingredients` / `steps` blocks for structured lists, `.tip` div
// blocks for asides, and `{{=key}}` substitutions for values that
// vary per cook (oven temp, batch size, etc.).
//
// Output: HTML strings, one per top-level block. Joined by the
// caller for a complete page.
//
// What this DSL exercises:
//   - frontmatter + schema + values + defaults + missing-required
//   - markers ({{=key}})
//   - pandoc parse
//   - ast walker with multiple block + inline handlers
//   - render/dispatchFenced (ingredients + steps)
//   - render/dispatchDiv (.tip)
//   - Ext threading (the recipe's `servings` count is available to
//     every handler via ctx.ext)

import yaml from 'js-yaml';
import { createPipeline } from '../../pipeline';
import { defineMarker } from '../../markers/registry';
import { runPandoc } from '../../pandoc/runPandoc';
import { lookupValue } from '../../schema/lookup';
import { dispatchFenced, dispatchDiv } from '../../render/dispatch';
import { defineFenced, defineDiv } from '../../render/types';
import type { AstHandlers } from '../../ast/types';
import type { FrontMatter } from '../../schema/types';
import type { PandocInline } from '../../pandoc/types';

// — Output types —

type B = string;   // block-level HTML
type I = string;   // inline-level HTML

// — Per-render extension state —
//
// `servings` lets handlers tweak quantities at render time. Other
// recipe-specific knobs (units, dietary annotations, etc.) would live
// here too.

interface RecipeExt {
  servings: number;
}

// — Fenced block parsers —

interface IngredientRow {
  /** Quantity + unit, e.g., "3", "1/3 cup", "pinch of". */
  qty?: string;
  /** The ingredient itself, e.g., "ripe bananas". */
  item: string;
}

function parseIngredients(content: string): IngredientRow[] {
  // YAML body: list of strings ("3 ripe bananas") or {qty, item} pairs.
  const raw = (yaml.load(content) ?? []) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry): IngredientRow => {
    if (typeof entry === 'string') return splitIngredientString(entry);
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      return {
        qty: e.qty != null ? String(e.qty) : undefined,
        item: String(e.item ?? ''),
      };
    }
    return { item: '' };
  });
}

// Heuristic: pull off a leading number-or-fraction (optionally followed
// by a known unit) as the quantity. Everything else is the item.
//   "3 ripe bananas"     → { qty: "3",        item: "ripe bananas" }
//   "1/3 cup butter"     → { qty: "1/3 cup",  item: "butter" }
//   "1 1/2 tsp salt"     → { qty: "1 1/2 tsp", item: "salt" }
//   "pinch of salt"      → { qty: "pinch of", item: "salt" }
//   "ripe bananas"       → { qty: undefined,  item: "ripe bananas" }
const UNITS = '(?:cup|cups|tsp|tbsp|oz|ounce|ounces|lb|lbs|pound|pounds|g|kg|ml|l|liter|liters|qt|pt|gallon|gallons|stick|sticks|clove|cloves|pinch)\\.?';
const QTY_RE = new RegExp(`^((?:\\d+(?:\\s+\\d+\\/\\d+)?(?:\\/\\d+)?))(\\s+${UNITS})?\\s+`, 'i');

function splitIngredientString(s: string): IngredientRow {
  const t = s.trim();
  const num = t.match(QTY_RE);
  if (num) {
    const qty = (num[1] + (num[2] ?? '')).trim();
    return { qty, item: t.slice(num[0].length).trim() };
  }
  const phrase = t.match(/^(pinch of|dash of|handful of|splash of|drizzle of)\s+/i);
  if (phrase) {
    return { qty: phrase[1].trim(), item: t.slice(phrase[0].length).trim() };
  }
  return { item: t };
}

function renderIngredientsHtml(rows: IngredientRow[]): string {
  const items = rows
    .map((r) =>
      r.qty
        ? `  <li><span class="qty">${escapeHtml(r.qty)}</span> ${escapeHtml(r.item)}</li>`
        : `  <li>${escapeHtml(r.item)}</li>`,
    )
    .join('\n');
  return `<ul class="ingredients">\n${items}\n</ul>`;
}

function parseSteps(content: string): string[] {
  const raw = (yaml.load(content) ?? []) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s));
}

function renderStepsHtml(steps: string[]): string {
  const items = steps.map((s) => `  <li>${escapeHtml(s)}</li>`).join('\n');
  return `<ol class="steps">\n${items}\n</ol>`;
}

// — Inline + block AST handlers —

const handlers: AstHandlers<B, I, RecipeExt> = {
  blocks: {
    Para: (n, _ctx, w) => [`<p>${w.inlines(n.c as PandocInline[]).join('')}</p>`],
    Header: (n, _ctx, w) => {
      const c = n.c as [number, unknown, PandocInline[]];
      const level = c[0];
      return [`<h${level}>${w.inlines(c[2]).join('')}</h${level}>`];
    },
    CodeBlock: dispatchFenced<B, I, RecipeExt>({
      ingredients: defineFenced({
        parse: parseIngredients,
        render: (rows) => [renderIngredientsHtml(rows)],
      }),
      steps: defineFenced({
        parse: parseSteps,
        render: (steps) => [renderStepsHtml(steps)],
      }),
    }),
    Div: dispatchDiv<B, I, RecipeExt>({
      tip: defineDiv<B, I, RecipeExt>({
        render: (children, _attrs, _ctx, walk) => {
          const inner = walk.blocks(children).join('\n');
          return [`<aside class="tip">\n${inner}\n</aside>`];
        },
      }),
    }),
  },
  inlines: {
    Str: (n) => [escapeHtml(n.c as string)],
    Space: () => [' '],
    SoftBreak: () => [' '],
    LineBreak: () => ['<br/>'],
    Strong: (n, _ctx, w) => [`<strong>${w.inlines(n.c as PandocInline[]).join('')}</strong>`],
    Emph: (n, _ctx, w) => [`<em>${w.inlines(n.c as PandocInline[]).join('')}</em>`],
  },
};

// HTML escape for text nodes — keep it boring + safe.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// — The pipeline —

export const recipedown = createPipeline<B, I, RecipeExt>({
  markers: {
    prefixes: {
      '=': defineMarker((rest, ctx) => String(lookupValue(rest, ctx.values) ?? '')),
    },
  },
  ast: handlers,
  parse: runPandoc,
  makeExt: (meta: FrontMatter) => ({
    servings: typeof meta.servings === 'number' ? meta.servings : 4,
  }),
});

/** Render a recipe source to a complete HTML document fragment. */
export async function renderRecipe(
  source: string,
  values: Record<string, unknown> = {},
): Promise<string> {
  const result = await recipedown.process(source, { values });
  return result.output.join('\n');
}
