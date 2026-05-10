// End-to-end recipedown tests. Real pandoc, real pipeline, real
// fenced-block parsing + div dispatch. Output is HTML strings.

import { test, expect, describe } from 'bun:test';
import { renderRecipe, recipedown } from './recipedown';

const SAMPLE = [
  '---',
  'title: Banana Bread',
  'servings: 12',     // top-level — drives Ext via makeExt()
  'schema:',
  '  oven_temp:',
  '    default: 350°F',
  '  difficulty:',
  '    default: easy',
  'values:',
  '  servings: 12',   // also a value so {{=servings}} substitutes in body
  '  cook_time: 1 hour',
  '---',
  '',
  '## Banana Bread',
  '',
  'A simple loaf for {{=servings}} people. Difficulty: {{=difficulty}}.',
  '',
  '```ingredients',
  '- 3 ripe bananas',
  '- 1/3 cup melted butter',
  '- 1 tsp baking soda',
  '- pinch of salt',
  '- 3/4 cup sugar',
  '```',
  '',
  '::: {.tip}',
  'Use **very ripe** bananas for the best flavor.',
  ':::',
  '',
  '```steps',
  '- Preheat oven to {{=oven_temp}}',
  '- Mash bananas in a large bowl',
  '- Mix in melted butter',
  '- Bake for {{=cook_time}}',
  '```',
].join('\n');

describe('recipedown — end-to-end', () => {
  test('renders a complete recipe with all block types', async () => {
    const out = await renderRecipe(SAMPLE);
    // Heading rendered.
    expect(out).toContain('<h2>Banana Bread</h2>');
    // Frontmatter values substituted in body prose.
    expect(out).toContain('A simple loaf for 12 people');
    expect(out).toContain('Difficulty: easy');
    // Schema default ({{=oven_temp}}) substituted inside fenced steps
    // — markers run BEFORE pandoc parses, so even fenced-block content
    // gets resolved.
    expect(out).toContain('Preheat oven to 350°F');
    // Frontmatter value reaches the steps too.
    expect(out).toContain('Bake for 1 hour');
  });

  test('ingredients block becomes a styled <ul>', async () => {
    const out = await renderRecipe(SAMPLE);
    expect(out).toContain('<ul class="ingredients">');
    expect(out).toContain('<span class="qty">3</span> ripe bananas');
    expect(out).toContain('<span class="qty">1/3 cup</span> melted butter');
    expect(out).toContain('<span class="qty">pinch of</span> salt');
    expect(out).toContain('</ul>');
  });

  test('steps block becomes a styled <ol>', async () => {
    const out = await renderRecipe(SAMPLE);
    expect(out).toContain('<ol class="steps">');
    expect(out).toContain('<li>Mash bananas in a large bowl</li>');
    expect(out).toContain('</ol>');
  });

  test('.tip Div becomes an <aside class="tip"> with rendered children', async () => {
    const out = await renderRecipe(SAMPLE);
    expect(out).toContain('<aside class="tip">');
    expect(out).toContain('<strong>very ripe</strong>');  // bold passes through
    expect(out).toContain('</aside>');
  });

  test('caller values override frontmatter values', async () => {
    const src = [
      '---',
      'values:',
      '  cook_time: 1 hour',
      '---',
      '',
      'Bake for {{=cook_time}}.',
    ].join('\n');
    const out = await renderRecipe(src, { cook_time: '90 minutes' });
    expect(out).toContain('Bake for 90 minutes.');
  });

  test('parseToAst short-circuits before HTML rendering — useful for JSON outputs', async () => {
    const result = await recipedown.parseToAst(SAMPLE);
    // AST has been built; the output array isn't on this checkpoint.
    expect(result.ast.blocks.length).toBeGreaterThan(0);
    // Markers were resolved before pandoc saw the body.
    expect(result.body).toContain('Bake for 1 hour');
    expect(result.body).not.toContain('{{');
  });

  test('missing required values surface in result.missing without throwing', async () => {
    const src = [
      '---',
      'schema:',
      '  must_fill:',
      '    required: true',
      '---',
      '',
      'A recipe.',
    ].join('\n');
    const result = await recipedown.process(src);
    expect(result.missing).toEqual(['must_fill']);
    expect(result.output.length).toBeGreaterThan(0);  // still rendered
  });

  test('Ext (servings) is computed from frontmatter via makeExt', async () => {
    const result = await recipedown.process(SAMPLE);
    expect(result.ext).toEqual({ servings: 12 });
  });

  test('Ext defaults when frontmatter omits servings', async () => {
    const result = await recipedown.process('# Some Recipe\n\nQuick.');
    expect(result.ext).toEqual({ servings: 4 });
  });

  test('the pipeline is reusable across recipes', async () => {
    const r1 = await renderRecipe('---\nvalues:\n  x: 1\n---\nA: {{=x}}.');
    const r2 = await renderRecipe('---\nvalues:\n  x: 2\n---\nA: {{=x}}.');
    expect(r1).toContain('A: 1.');
    expect(r2).toContain('A: 2.');
  });

  test('inline emphasis (Strong / Emph) renders correctly inside paragraphs', async () => {
    const out = await renderRecipe('This is **bold** and *italic*.');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
  });

  test('the renderer does not leak raw HTML from values (no XSS surface)', async () => {
    // Pandoc treats `<script>...</script>` as a RawBlock/RawInline; the
    // recipedown renderer doesn't register a handler for those, so they
    // drop entirely. Net effect: no script in output regardless of how
    // the malicious value was injected. Safe-by-default for HTML output.
    const out = await renderRecipe(
      '---\nvalues:\n  x: "<script>alert(1)</script>"\n---\nDanger: {{=x}}.',
    );
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('alert(1)');
  });
});
