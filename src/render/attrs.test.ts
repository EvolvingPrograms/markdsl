// Attrs parsing tests. Pandoc's positional shape is easy to misread,
// so these tests document the exact shape we expect.

import { test, expect, describe } from 'bun:test';
import { parseDivAttrs, parseCodeBlockAttrs } from './attrs';
import type { PandocBlock } from '../pandoc/types';

describe('parseDivAttrs', () => {
  test('extracts id, classes, kvs, and children', () => {
    const node: PandocBlock = {
      t: 'Div',
      c: [
        ['my-id', ['center', 'pageBreak'], [['style', 'bold']]],
        [
          { t: 'Para', c: [{ t: 'Str', c: 'A' }] },
          { t: 'Para', c: [{ t: 'Str', c: 'B' }] },
        ],
      ],
    };
    const attrs = parseDivAttrs(node);
    expect(attrs.id).toBe('my-id');
    expect(attrs.classes).toEqual(['center', 'pageBreak']);
    expect(attrs.kvs).toEqual([['style', 'bold']]);
    expect(attrs.children.length).toBe(2);
  });

  test('handles empty attrs', () => {
    const node: PandocBlock = {
      t: 'Div',
      c: [['', [], []], []],
    };
    const attrs = parseDivAttrs(node);
    expect(attrs).toEqual({ id: '', classes: [], kvs: [], children: [] });
  });

  test('returns empty fallback when node is not a Div', () => {
    const attrs = parseDivAttrs({ t: 'Para', c: [] });
    expect(attrs).toEqual({ id: '', classes: [], kvs: [], children: [] });
  });

  test('survives malformed `c` (defensive)', () => {
    const node: PandocBlock = { t: 'Div', c: ['oops' as unknown as never] };
    const attrs = parseDivAttrs(node);
    expect(attrs).toEqual({ id: '', classes: [], kvs: [], children: [] });
  });

  test('filters non-string class entries', () => {
    const node: PandocBlock = {
      t: 'Div',
      c: [['', ['real-class', 42, null, 'another'], []], []],
    };
    expect(parseDivAttrs(node).classes).toEqual(['real-class', 'another']);
  });
});

describe('parseCodeBlockAttrs', () => {
  test('extracts id, classes, kvs, and content', () => {
    const node: PandocBlock = {
      t: 'CodeBlock',
      c: [['', ['fields'], []], 'effective_date\nwriter_name'],
    };
    const attrs = parseCodeBlockAttrs(node);
    expect(attrs.classes).toEqual(['fields']);
    expect(attrs.content).toBe('effective_date\nwriter_name');
  });

  test('handles empty content', () => {
    const node: PandocBlock = {
      t: 'CodeBlock',
      c: [['', ['fields'], []], ''],
    };
    expect(parseCodeBlockAttrs(node).content).toBe('');
  });

  test('returns empty fallback when node is not a CodeBlock', () => {
    expect(parseCodeBlockAttrs({ t: 'Para', c: [] })).toEqual({
      id: '', classes: [], kvs: [], content: '',
    });
  });
});
