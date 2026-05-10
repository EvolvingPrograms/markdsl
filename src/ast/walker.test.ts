// Walker tests use a synthetic string-emitting backend so assertions
// can compare plain strings — no docx, no LaTeX, just the dispatch /
// recursion / fallthrough logic. The real renderers (legalese-docx,
// texdown) ship their own end-to-end tests against actual output.

import { test, expect, describe } from 'bun:test';
import { createWalker } from './walker';
import type { AstHandlers, RenderContext } from './types';
import type { PandocBlock, PandocInline } from '../pandoc/types';

type B = string;        // block output: just a string per block
type I = string;        // inline output: just a string per inline

function makeCtx(): RenderContext {
  return { values: {}, schema: undefined, ext: undefined };
}

describe('createWalker — dispatch', () => {
  test('routes a block to its registered handler by `t` tag', () => {
    const handlers: AstHandlers<B, I> = {
      blocks: {
        Para: (_n) => ['<para>'],
      },
    };
    const walk = createWalker(handlers, makeCtx());
    expect(walk.block({ t: 'Para', c: [] })).toEqual(['<para>']);
  });

  test('routes an inline to its registered handler by `t` tag', () => {
    const handlers: AstHandlers<B, I> = {
      inlines: {
        Str: (n) => [n.c as string],
        Space: () => [' '],
      },
    };
    const walk = createWalker(handlers, makeCtx());
    expect(walk.inline({ t: 'Str', c: 'hello' })).toEqual(['hello']);
    expect(walk.inline({ t: 'Space' })).toEqual([' ']);
  });

  test('blocks() and inlines() pass through arrays in order', () => {
    const handlers: AstHandlers<B, I> = {
      blocks: { Para: (n) => [(n.c as string)] },
    };
    const walk = createWalker(handlers, makeCtx());
    expect(walk.blocks([
      { t: 'Para', c: 'one' },
      { t: 'Para', c: 'two' },
      { t: 'Para', c: 'three' },
    ])).toEqual(['one', 'two', 'three']);
  });
});

describe('createWalker — recursion', () => {
  test('a block handler can render its inline children via walk.inlines', () => {
    const handlers: AstHandlers<B, I> = {
      blocks: {
        Para: (n, _c, w) => [`[para:${w.inlines(n.c as PandocInline[]).join('')}]`],
      },
      inlines: {
        Str: (n) => [n.c as string],
        Space: () => [' '],
      },
    };
    const walk = createWalker(handlers, makeCtx());
    const para: PandocBlock = {
      t: 'Para',
      c: [
        { t: 'Str', c: 'hello' },
        { t: 'Space' },
        { t: 'Str', c: 'world' },
      ],
    };
    expect(walk.block(para)).toEqual(['[para:hello world]']);
  });

  test('a Div block can emit multiple paragraphs (block fan-out)', () => {
    const handlers: AstHandlers<B, I> = {
      blocks: {
        Para: (n) => [`[${(n.c as { t: string; c: string }[])[0]?.c}]`],
      },
    };
    const walk = createWalker(handlers, makeCtx());
    // No Div handler registered — falls through to the wrapper-recurse
    // default, which spreads the children.
    const div: PandocBlock = {
      t: 'Div',
      c: [['', [], []], [
        { t: 'Para', c: [{ t: 'Str', c: 'a' }] },
        { t: 'Para', c: [{ t: 'Str', c: 'b' }] },
      ]],
    };
    expect(walk.block(div)).toEqual(['[a]', '[b]']);
  });
});

describe('createWalker — default fallthroughs', () => {
  test('wrapper inlines (Strong/Emph/Underline/etc.) recurse into children by default', () => {
    const handlers: AstHandlers<B, I> = {
      inlines: { Str: (n) => [n.c as string] },
      // No Strong, Emph, Underline, etc. handlers — defaults apply.
    };
    const walk = createWalker(handlers, makeCtx());
    const strong: PandocInline = {
      t: 'Strong',
      c: [{ t: 'Str', c: 'bold' }],
    };
    expect(walk.inline(strong)).toEqual(['bold']);

    const emph: PandocInline = {
      t: 'Emph',
      c: [{ t: 'Str', c: 'italic' }],
    };
    expect(walk.inline(emph)).toEqual(['italic']);

    const underline: PandocInline = {
      t: 'Underline',
      c: [{ t: 'Str', c: 'under' }],
    };
    expect(walk.inline(underline)).toEqual(['under']);
  });

  test('Span (with attrs prefix) recurses into the children portion', () => {
    const handlers: AstHandlers<B, I> = {
      inlines: { Str: (n) => [n.c as string] },
    };
    const walk = createWalker(handlers, makeCtx());
    // Pandoc Span shape: c = [[id, classes, kvs], children]
    const span: PandocInline = {
      t: 'Span',
      c: [['', ['underline'], []], [{ t: 'Str', c: 'EXHIBIT' }]],
    };
    expect(walk.inline(span)).toEqual(['EXHIBIT']);
  });

  test('Quoted (with quoteType prefix) recurses into the children portion', () => {
    const handlers: AstHandlers<B, I> = {
      inlines: { Str: (n) => [n.c as string] },
    };
    const walk = createWalker(handlers, makeCtx());
    const quoted: PandocInline = {
      t: 'Quoted',
      c: [{ t: 'DoubleQuote' }, [{ t: 'Str', c: 'hello' }]],
    };
    expect(walk.inline(quoted)).toEqual(['hello']);
  });

  test('leaf inlines without a handler return [] (visible failure mode)', () => {
    const handlers: AstHandlers<B, I> = {};
    const walk = createWalker(handlers, makeCtx());
    expect(walk.inline({ t: 'Str', c: 'hello' })).toEqual([]);
    expect(walk.inline({ t: 'Code', c: [['', [], []], 'foo'] })).toEqual([]);
  });

  test('leaf blocks without a handler return [] (visible failure mode)', () => {
    const walk = createWalker<B, I>({}, makeCtx());
    expect(walk.block({ t: 'Header', c: [1, ['', [], []], []] })).toEqual([]);
    expect(walk.block({ t: 'CodeBlock', c: [['', [], []], 'foo'] })).toEqual([]);
  });

  test('BlockQuote recurses into its block children by default', () => {
    const handlers: AstHandlers<B, I> = {
      blocks: { Para: (n) => [`[${(n.c as { c: string }[])[0]?.c}]`] },
    };
    const walk = createWalker(handlers, makeCtx());
    const bq: PandocBlock = {
      t: 'BlockQuote',
      c: [
        { t: 'Para', c: [{ t: 'Str', c: 'q1' }] },
        { t: 'Para', c: [{ t: 'Str', c: 'q2' }] },
      ],
    };
    expect(walk.block(bq)).toEqual(['[q1]', '[q2]']);
  });
});

describe('createWalker — overriding catch-alls', () => {
  test('unknownBlock catch-all is invoked for unhandled block types', () => {
    const handlers: AstHandlers<B, I> = {
      unknownBlock: (n) => [`<unhandled-block:${n.t}>`],
    };
    const walk = createWalker(handlers, makeCtx());
    expect(walk.block({ t: 'CodeBlock', c: [['', [], []], 'foo'] }))
      .toEqual(['<unhandled-block:CodeBlock>']);
  });

  test('unknownInline catch-all is invoked for unhandled inline types', () => {
    const handlers: AstHandlers<B, I> = {
      unknownInline: (n) => [`<unhandled-inline:${n.t}>`],
    };
    const walk = createWalker(handlers, makeCtx());
    expect(walk.inline({ t: 'Math', c: [{ t: 'InlineMath' }, 'x'] }))
      .toEqual(['<unhandled-inline:Math>']);
  });

  test('catch-all overrides the wrapper-recurse default for those types too', () => {
    const handlers: AstHandlers<B, I> = {
      unknownInline: (n) => [`<${n.t}>`],
    };
    const walk = createWalker(handlers, makeCtx());
    // Strong is normally a wrapper that recurses; the catch-all wins.
    expect(walk.inline({ t: 'Strong', c: [{ t: 'Str', c: 'bold' }] }))
      .toEqual(['<Strong>']);
  });
});

describe('createWalker — ctx access', () => {
  test('handlers receive ctx with values + schema + ext', () => {
    interface Ext { font: string }
    const handlers: AstHandlers<B, I, Ext> = {
      inlines: {
        Str: (n, ctx) => [`[${ctx.ext.font}:${n.c as string}]`],
      },
    };
    const ctx: RenderContext<Ext> = { values: {}, schema: undefined, ext: { font: 'EB Garamond' } };
    const walk = createWalker(handlers, ctx);
    expect(walk.inline({ t: 'Str', c: 'hi' })).toEqual(['[EB Garamond:hi]']);
  });

  test('walker exposes ctx as a property for handlers that want to peek', () => {
    const ctx = makeCtx();
    const walk = createWalker<B, I>({}, ctx);
    expect(walk.ctx).toBe(ctx);
  });
});

describe('createWalker — composition', () => {
  test('a small renderer end-to-end: Header, Para, Strong, Emph, Str, Space', () => {
    const handlers: AstHandlers<B, I> = {
      blocks: {
        Header: (n, _c, w) => {
          const c = n.c as [number, unknown, PandocInline[]];
          return [`<h${c[0]}>${w.inlines(c[2]).join('')}</h${c[0]}>`];
        },
        Para: (n, _c, w) => [`<p>${w.inlines(n.c as PandocInline[]).join('')}</p>`],
      },
      inlines: {
        Str:        (n) => [n.c as string],
        Space:      () => [' '],
        SoftBreak:  () => [' '],
        Strong:     (n, _c, w) => [`<b>${w.inlines(n.c as PandocInline[]).join('')}</b>`],
        Emph:       (n, _c, w) => [`<i>${w.inlines(n.c as PandocInline[]).join('')}</i>`],
      },
    };
    const walk = createWalker(handlers, makeCtx());
    const ast: PandocBlock[] = [
      { t: 'Header', c: [1, ['', [], []], [{ t: 'Str', c: 'Title' }]] },
      { t: 'Para', c: [
        { t: 'Str', c: 'Hello' },
        { t: 'Space' },
        { t: 'Strong', c: [{ t: 'Str', c: 'world' }] },
        { t: 'Str', c: '.' },
      ]},
    ];
    expect(walk.blocks(ast)).toEqual(['<h1>Title</h1>', '<p>Hello <b>world</b>.</p>']);
  });
});
