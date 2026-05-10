// Pipeline orchestration tests. Synthetic configurations exercise each
// stage and the wiring between them. Real consumers (legalese, texdown)
// have their own end-to-end tests against actual outputs.

import { test, expect, describe } from 'bun:test';
import { createPipeline } from './pipeline';
import { defineMarker, type MarkerRegistry } from './markers/registry';
import type { AstHandlers } from './ast/types';
import type { PandocAst, PandocBlock, PandocInline } from './pandoc/types';

// — Synthetic Pandoc parser for tests —
//
// The framework has its own pandoc engines (./pandoc/runPandoc); for
// pipeline tests we want to assert the wiring without spawning
// processes. This minimal parser handles only what each test exercises.

function fakeParse(body: string): PandocAst {
  // Each non-empty paragraph becomes a Para with a single Str of its content.
  const blocks: PandocBlock[] = body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({
      t: 'Para',
      c: [{ t: 'Str', c: p }],
    } as PandocBlock));
  return { blocks };
}

// — Synthetic handlers (string-emitting) —

const stringHandlers: AstHandlers<string, string> = {
  blocks: { Para: (n, _c, w) => [`<p>${w.inlines(n.c as PandocInline[]).join('')}</p>`] },
  inlines: {
    Str: (n) => [n.c as string],
    Space: () => [' '],
    SoftBreak: () => [' '],
  },
};

// Marker registry used in most tests: `=` substitutes value verbatim;
// fallback prints the key for visibility.
const stringMarkers: MarkerRegistry = {
  prefixes: {
    '=': defineMarker((rest, ctx) => String(ctx.values[rest] ?? `?${rest}?`)),
    '': defineMarker((rest) => `[ref:${rest}]`),
  },
};

describe('createPipeline — full process()', () => {
  test('end-to-end: frontmatter → values → markers → parse → render', async () => {
    const pipe = createPipeline<string, string>({
      markers: stringMarkers,
      ast: stringHandlers,
      parse: fakeParse,
    });
    const src = [
      '---',
      'values:',
      '  name: World',
      '---',
      '',
      'Hello {{=name}}.',
    ].join('\n');
    const result = await pipe.process(src);
    expect(result.output).toEqual(['<p>Hello World.</p>']);
    expect(result.values).toEqual({ name: 'World' });
    expect(result.missing).toEqual([]);
    expect(result.body).toContain('Hello World.');
  });

  test('caller-supplied values override frontmatter', async () => {
    const pipe = createPipeline<string, string>({
      markers: stringMarkers,
      ast: stringHandlers,
      parse: fakeParse,
    });
    const src = ['---', 'values:', '  name: Frontmatter', '---', '', 'Hi {{=name}}.'].join('\n');
    const result = await pipe.process(src, { values: { name: 'Caller' } });
    expect(result.output).toEqual(['<p>Hi Caller.</p>']);
    expect(result.values.name).toBe('Caller');
  });

  test('schema-defaults fill in missing values', async () => {
    const pipe = createPipeline<string, string>({
      markers: stringMarkers,
      ast: stringHandlers,
      parse: fakeParse,
    });
    const src = [
      '---',
      'schema:',
      '  greeting:',
      '    default: Hi',
      '---',
      '',
      '{{=greeting}}, world.',
    ].join('\n');
    const result = await pipe.process(src);
    expect(result.values.greeting).toBe('Hi');
    expect(result.output).toEqual(['<p>Hi, world.</p>']);
  });
});

describe('createPipeline — required + missing', () => {
  test('reports missing required fields without throwing by default', async () => {
    const pipe = createPipeline<string, string>({
      markers: stringMarkers,
      ast: stringHandlers,
      parse: fakeParse,
    });
    const src = [
      '---',
      'schema:',
      '  must_fill:',
      '    required: true',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = await pipe.process(src);
    expect(result.missing).toEqual(['must_fill']);
    expect(result.output).toEqual(['<p>Body.</p>']);  // still rendered
  });

  test('strict: true throws when required fields are missing', async () => {
    const pipe = createPipeline<string, string>({
      markers: stringMarkers,
      ast: stringHandlers,
      parse: fakeParse,
    });
    const src = ['---', 'schema:', '  x:', '    required: true', '---', '', 'Body.'].join('\n');
    await expect(pipe.process(src, { strict: true })).rejects.toThrow(/missing/);
  });
});

describe('createPipeline — short-circuit checkpoints', () => {
  test('resolveMarkers returns the substituted body without parsing', () => {
    const pipe = createPipeline<string, string>({
      markers: stringMarkers,
      ast: stringHandlers,
      parse: fakeParse,
    });
    const src = ['---', 'values:', '  name: Alice', '---', '', 'Hi {{=name}}.'].join('\n');
    const result = pipe.resolveMarkers(src);
    expect(result.body).toContain('Hi Alice.');
    expect(result.body).not.toContain('{{');
    // No `ast` / `output` on this result type (synchronous, parse hasn't run).
  });

  test('parseToAst returns the AST without running the renderer', async () => {
    const pipe = createPipeline<string, string>({
      markers: stringMarkers,
      ast: stringHandlers,
      parse: fakeParse,
    });
    const src = ['---', 'values:', '  x: One', '---', '', '{{=x}}.'].join('\n');
    const result = await pipe.parseToAst(src);
    expect(result.ast.blocks.length).toBe(1);
    expect(result.ast.blocks[0]?.t).toBe('Para');
  });
});

describe('createPipeline — Ext threading', () => {
  interface Ext { font: string }

  test('makeExt seeds the ext from frontmatter; opts.ext overrides', async () => {
    const pipe = createPipeline<string, string, Ext>({
      markers: stringMarkers,
      ast: {
        blocks: {
          Para: (n, ctx, w) => [`<p font=${ctx.ext.font}>${w.inlines(n.c as PandocInline[]).join('')}</p>`],
        },
        inlines: {
          Str: (n) => [n.c as string],
          Space: () => [' '],
          SoftBreak: () => [' '],
        },
      },
      parse: fakeParse,
      makeExt: (meta) => ({ font: ((meta.style as { font?: string })?.font) ?? 'default' }),
    });

    // Frontmatter-driven font.
    const r1 = await pipe.process(['---', 'style:', '  font: EB Garamond', '---', '', 'Hi.'].join('\n'));
    expect(r1.output).toEqual(['<p font=EB Garamond>Hi.</p>']);
    expect(r1.ext).toEqual({ font: 'EB Garamond' });

    // Caller override.
    const r2 = await pipe.process('Hi.', { ext: { font: 'Helvetica' } });
    expect(r2.output).toEqual(['<p font=Helvetica>Hi.</p>']);
  });
});

describe('createPipeline — async parse', () => {
  test('awaits an async parse callback (pandoc-wasm shape)', async () => {
    const asyncParse = async (body: string): Promise<PandocAst> => fakeParse(body);
    const pipe = createPipeline<string, string>({
      markers: stringMarkers,
      ast: stringHandlers,
      parse: asyncParse,
    });
    const result = await pipe.process('Hello.');
    expect(result.output).toEqual(['<p>Hello.</p>']);
  });
});
