// Dispatcher tests. Synthetic string-emitting handlers so we can
// assert exact output without involving any real parser/renderer.

import { test, expect, describe } from 'bun:test';
import { dispatchFenced, dispatchDiv } from './dispatch';
import { defineFenced, defineDiv } from './types';
import { createWalker } from '../ast/walker';
import type { AstHandlers, RenderContext } from '../ast/types';
import type { PandocBlock } from '../pandoc/types';

type B = string;
type I = string;
const CTX: RenderContext = { values: {}, schema: undefined, ext: undefined };

describe('dispatchFenced', () => {
  test('routes by first language class to the matching FencedHandler', () => {
    const fields = defineFenced({
      parse: (content: string) => content.split(/\n/).filter(Boolean),
      render: (rows) => [`<fields:${rows.join(',')}>`],
    });
    const sig = defineFenced({
      parse: (content: string) => content.trim(),
      render: (text) => [`<sig:${text}>`],
    });
    const handler = dispatchFenced<B, I>({ fields, sig });
    const walk = createWalker<B, I>({}, CTX);

    const fieldsBlock: PandocBlock = {
      t: 'CodeBlock',
      c: [['', ['fields'], []], 'a\nb\nc'],
    };
    expect(handler(fieldsBlock, CTX, walk)).toEqual(['<fields:a,b,c>']);

    const sigBlock: PandocBlock = {
      t: 'CodeBlock',
      c: [['', ['sig'], []], 'WRITER'],
    };
    expect(handler(sigBlock, CTX, walk)).toEqual(['<sig:WRITER>']);
  });

  test('falls through to fallback for unknown language', () => {
    const handler = dispatchFenced<B, I>(
      { fields: defineFenced({ parse: (c) => c, render: () => ['fields-out'] }) },
      (n) => [`<unknown:${(n.c as [unknown, string])[1]}>`],
    );
    const walk = createWalker<B, I>({}, CTX);
    const block: PandocBlock = {
      t: 'CodeBlock',
      c: [['', ['unknown'], []], 'content'],
    };
    expect(handler(block, CTX, walk)).toEqual(['<unknown:content>']);
  });

  test('returns [] for unknown language with no fallback', () => {
    const handler = dispatchFenced<B, I>({});
    const walk = createWalker<B, I>({}, CTX);
    const block: PandocBlock = {
      t: 'CodeBlock',
      c: [['', ['unknown'], []], 'content'],
    };
    expect(handler(block, CTX, walk)).toEqual([]);
  });

  test('returns [] for a CodeBlock with no language class', () => {
    const handler = dispatchFenced<B, I>({
      fields: defineFenced({ parse: (c) => c, render: () => ['fields-out'] }),
    });
    const walk = createWalker<B, I>({}, CTX);
    const block: PandocBlock = {
      t: 'CodeBlock',
      c: [['', [], []], 'content'],
    };
    expect(handler(block, CTX, walk)).toEqual([]);
  });

  test('plugs into AstHandlers.blocks.CodeBlock cleanly', () => {
    const handlers: AstHandlers<B, I> = {
      blocks: {
        CodeBlock: dispatchFenced({
          fields: defineFenced({
            parse: (c: string) => c,
            render: (text) => [`[fields:${text}]`],
          }),
        }),
      },
    };
    const walk = createWalker(handlers, CTX);
    const block: PandocBlock = {
      t: 'CodeBlock',
      c: [['', ['fields'], []], 'foo'],
    };
    expect(walk.block(block)).toEqual(['[fields:foo]']);
  });
});

describe('dispatchDiv', () => {
  test('routes by first matching class', () => {
    const center = defineDiv<B, I>({
      render: (children, _attrs, _ctx, walk) =>
        walk.blocks(children).map((c) => `<center>${c}</center>`),
    });
    const handler = dispatchDiv<B, I>({ center });
    const walk = createWalker<B, I>({
      blocks: { Para: (n) => [(n.c as { c: string }[])[0]?.c ?? ''] },
    }, CTX);
    const div: PandocBlock = {
      t: 'Div',
      c: [['', ['center'], []], [{ t: 'Para', c: [{ c: 'hi' }] }]],
    };
    expect(handler(div, CTX, walk)).toEqual(['<center>hi</center>']);
  });

  test('picks the first class with a handler when multiple are present', () => {
    const center = defineDiv({ render: () => ['<from-center>'] });
    const indent = defineDiv({ render: () => ['<from-indent>'] });
    const handler = dispatchDiv<B, I>({ center, indent });
    const walk = createWalker<B, I>({}, CTX);
    // Div has BOTH classes — `.center` wins because it's first.
    const div: PandocBlock = {
      t: 'Div',
      c: [['', ['center', 'indent'], []], []],
    };
    expect(handler(div, CTX, walk)).toEqual(['<from-center>']);
  });

  test('falls through to fallback when no class matches', () => {
    const handler = dispatchDiv<B, I>(
      { center: defineDiv({ render: () => ['<center>'] }) },
      () => ['<fallback>'],
    );
    const walk = createWalker<B, I>({}, CTX);
    const div: PandocBlock = {
      t: 'Div',
      c: [['', ['unknown'], []], []],
    };
    expect(handler(div, CTX, walk)).toEqual(['<fallback>']);
  });

  test('returns [] for unmatched div with no fallback', () => {
    const handler = dispatchDiv<B, I>({});
    const walk = createWalker<B, I>({}, CTX);
    const div: PandocBlock = {
      t: 'Div',
      c: [['', ['unknown'], []], []],
    };
    expect(handler(div, CTX, walk)).toEqual([]);
  });

  test('passes attrs (id + kvs) through to the handler', () => {
    const tagged = defineDiv({
      render: (_children, attrs) => [`<div id=${attrs.id || '∅'}>`],
    });
    const handler = dispatchDiv<B, I>({ tagged });
    const walk = createWalker<B, I>({}, CTX);
    const div: PandocBlock = {
      t: 'Div',
      c: [['my-id', ['tagged'], []], []],
    };
    expect(handler(div, CTX, walk)).toEqual(['<div id=my-id>']);
  });
});
