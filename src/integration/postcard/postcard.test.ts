// End-to-end postcard tests. Real pandoc, real pipeline.

import { test, expect, describe } from 'bun:test';
import { renderPostcard, postcard } from './postcard';

describe('postcard — minimal DSL end-to-end', () => {
  test('substitutes {{=to}} / {{=from}} from frontmatter values', async () => {
    const src = [
      '---',
      'values:',
      '  to: Mom',
      '  from: Alice',
      '---',
      '',
      'Dear {{=to}},',
      '',
      'Wish you were here. Love, {{=from}}.',
    ].join('\n');
    const out = await renderPostcard(src);
    expect(out).toBe('Dear Mom,\n\nWish you were here. Love, Alice.');
  });

  test('caller-supplied values override frontmatter (per-deal addressing)', async () => {
    const src = [
      '---',
      'values:',
      '  to: World',
      '---',
      '',
      'Hi {{=to}}.',
    ].join('\n');
    const out = await renderPostcard(src, { to: 'specific friend' });
    expect(out).toBe('Hi specific friend.');
  });

  test('missing values render as empty (no crash, no leftover marker)', async () => {
    const src = 'Dear {{=missing}}, here\'s some news.';
    const out = await renderPostcard(src);
    // pandoc's +smart converts straight `'` to `’`.
    expect(out).toBe('Dear , here’s some news.');
    expect(out).not.toContain('{{');
  });

  test('the pipeline is reusable across documents (closure-captured config)', async () => {
    const r1 = await postcard.process(
      '---\nvalues:\n  who: Alice\n---\nHi {{=who}}.',
    );
    const r2 = await postcard.process(
      '---\nvalues:\n  who: Bob\n---\nHi {{=who}}.',
    );
    expect(r1.output[0]).toBe('Hi Alice.');
    expect(r2.output[0]).toBe('Hi Bob.');
  });

  test('parseToAst short-circuits before rendering', async () => {
    const src = '---\nvalues:\n  who: Alice\n---\nHi {{=who}}.';
    const result = await postcard.parseToAst(src);
    expect(result.ast.blocks.length).toBe(1);
    expect(result.ast.blocks[0]?.t).toBe('Para');
    expect(result.body).toContain('Hi Alice.');  // marker resolved before parse
  });
});
