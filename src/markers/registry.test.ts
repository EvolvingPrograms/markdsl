// Registry contract tests. The registry is mostly a data structure;
// these are sanity checks that the type-level contract behaves and the
// `defineMarker` helper composes naturally.

import { test, expect, describe } from 'bun:test';
import { defineMarker, type MarkerHandler, type MarkerRegistry } from './registry';

describe('defineMarker', () => {
  test('returns the handler verbatim (identity helper)', () => {
    const fn: MarkerHandler = (rest) => rest.toUpperCase();
    const wrapped = defineMarker(fn);
    expect(wrapped).toBe(fn);
  });

  test('preserves the handler signature for callers', () => {
    const handler = defineMarker((rest, ctx) => `${rest}:${ctx.values.x ?? '∅'}`);
    expect(handler('hello', { values: { x: 'world' }, schema: undefined, next: undefined, rawInner: '' }))
      .toBe('hello:world');
  });
});

describe('MarkerRegistry shape', () => {
  test('a registry can list multiple prefix handlers + a fallback', () => {
    const registry: MarkerRegistry = {
      prefixes: {
        '$':  defineMarker((rest) => `INTRODUCE(${rest})`),
        '=':  defineMarker((rest) => `VALUE(${rest})`),
        '':   defineMarker((rest) => `REF(${rest})`),  // fallback
      },
    };
    const ctx = { values: {}, schema: undefined, next: undefined, rawInner: '' };
    expect(registry.prefixes['$']?.('foo', ctx)).toBe('INTRODUCE(foo)');
    expect(registry.prefixes['=']?.('foo', ctx)).toBe('VALUE(foo)');
    expect(registry.prefixes['']?.('foo', ctx)).toBe('REF(foo)');
  });

  test('a registry without prefix handlers is valid (substituteMarkers will leave markers in place)', () => {
    const registry: MarkerRegistry = { prefixes: {} };
    expect(registry.prefixes['$']).toBeUndefined();
  });
});
