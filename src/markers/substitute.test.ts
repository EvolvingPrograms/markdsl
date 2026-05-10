// substituteMarkers tests. The walker is the load-bearing function:
// every marker in every consumer's body flows through it. Tests cover
// dispatch, fallback, unhandled markers, the `next`/`rawInner` context,
// and a few realistic compositions with synthetic handlers.

import { test, expect, describe } from 'bun:test';
import { substituteMarkers } from './substitute';
import { defineMarker, type MarkerRegistry } from './registry';

describe('substituteMarkers — dispatch', () => {
  test('routes by first-character prefix to the matching handler', () => {
    const reg: MarkerRegistry = {
      prefixes: {
        '$': defineMarker((rest) => `[INTRO:${rest}]`),
        '=': defineMarker((rest) => `[VAL:${rest}]`),
      },
    };
    const out = substituteMarkers('A {{$foo}} and B {{=bar}} done.', reg);
    expect(out).toBe('A [INTRO:foo] and B [VAL:bar] done.');
  });

  test('uses the empty-string fallback when no prefix matches', () => {
    const reg: MarkerRegistry = {
      prefixes: {
        '$': defineMarker((rest) => `[INTRO:${rest}]`),
        '':  defineMarker((rest) => `[REF:${rest}]`),
      },
    };
    const out = substituteMarkers('Hello {{key}} and {{$foo}}.', reg);
    expect(out).toBe('Hello [REF:key] and [INTRO:foo].');
  });

  test('leaves markers in place when no prefix and no fallback is registered', () => {
    const reg: MarkerRegistry = {
      prefixes: {
        '$': defineMarker((rest) => `[INTRO:${rest}]`),
      },
    };
    // Visible-by-default — partial setups don't silently swallow markers.
    expect(substituteMarkers('Hello {{key}}.', reg)).toBe('Hello {{key}}.');
  });

  test('leaves empty markers (`{{ }}`) untouched', () => {
    const reg: MarkerRegistry = {
      prefixes: { '': defineMarker((rest) => `HIT:${rest}`) },
    };
    expect(substituteMarkers('foo {{   }} bar', reg)).toBe('foo {{   }} bar');
  });
});

describe('substituteMarkers — context', () => {
  test('passes values and schema through to the handler', () => {
    const reg: MarkerRegistry = {
      prefixes: {
        '': defineMarker((rest, ctx) => String(ctx.values[rest] ?? '∅')),
      },
    };
    expect(substituteMarkers(
      'Hello {{name}}.',
      reg,
      { values: { name: 'World' } },
    )).toBe('Hello World.');
  });

  test('exposes the next source character via ctx.next', () => {
    const reg: MarkerRegistry = {
      prefixes: {
        '=': defineMarker((rest, ctx) => {
          let v = String(ctx.values[rest] ?? '');
          // Trailing-dot swallow demonstration.
          if (ctx.next === '.' && v.endsWith('.')) v = v.slice(0, -1);
          return v;
        }),
      },
    };
    const out = substituteMarkers(
      'Filed by {{=co}}. Today.',
      reg,
      { values: { co: 'Acme Inc.' } },
    );
    expect(out).toBe('Filed by Acme Inc. Today.');
    expect(out).not.toContain('Inc..');
  });

  test('exposes the trimmed full inner via ctx.rawInner', () => {
    const reg: MarkerRegistry = {
      prefixes: {
        // The handler can inspect the prefix character itself if it
        // wants — the dispatcher already stripped it for `rest`.
        '': defineMarker((rest, ctx) => `(prefix=${ctx.rawInner.charAt(0)},rest=${rest})`),
      },
    };
    expect(substituteMarkers('{{$foo}}', { prefixes: {
      '': defineMarker((rest, ctx) => `(raw=${ctx.rawInner}, rest=${rest})`),
    } })).toBe('(raw=$foo, rest=$foo)');
  });

  test('ctx.next is undefined when the marker is at end of body', () => {
    const reg: MarkerRegistry = {
      prefixes: {
        '': defineMarker((rest, ctx) => `${rest}<${ctx.next === undefined ? 'EOF' : ctx.next}>`),
      },
    };
    expect(substituteMarkers('{{x}}', reg)).toBe('x<EOF>');
  });
});

describe('substituteMarkers — composition', () => {
  test('multiple markers in one paragraph render in order', () => {
    const reg: MarkerRegistry = {
      prefixes: { '': defineMarker((rest, ctx) => String(ctx.values[rest] ?? rest)) },
    };
    const out = substituteMarkers(
      'A: {{a}}, B: {{b}}, C: {{c}}.',
      reg,
      { values: { a: 'one', b: 'two', c: 'three' } },
    );
    expect(out).toBe('A: one, B: two, C: three.');
  });

  test('output can carry markdown emphasis for downstream pandoc parsing', () => {
    const reg: MarkerRegistry = {
      prefixes: {
        '!': defineMarker((rest) => `***"${rest}"***`),
      },
    };
    expect(substituteMarkers('See {{!Schedule A}}.', reg))
      .toBe('See ***"Schedule A"***.');
  });

  test('output can carry inline HTML (e.g. small-caps span) for rich rendering', () => {
    const reg: MarkerRegistry = {
      prefixes: {
        '^': defineMarker((rest) => `<span class="smallcaps">${rest}</span>`),
      },
    };
    expect(substituteMarkers('{{^WHEREAS}}, the parties...', reg))
      .toBe('<span class="smallcaps">WHEREAS</span>, the parties...');
  });

  test('whitespace inside the inner is trimmed before dispatch', () => {
    const reg: MarkerRegistry = {
      prefixes: { '$': defineMarker((rest) => `[${rest}]`) },
    };
    expect(substituteMarkers('{{ $  hello  }}', reg)).toBe('[hello]');
  });
});

describe('substituteMarkers — non-marker text is preserved', () => {
  test('returns the input verbatim when there are no markers', () => {
    const src = 'Just plain markdown with no marker pattern.';
    expect(substituteMarkers(src, { prefixes: {} })).toBe(src);
  });

  test('does not match `{x}` or `{{x` (only full `{{...}}`)', () => {
    const src = 'Single {x} and unclosed {{x.';
    expect(substituteMarkers(src, { prefixes: {
      '': defineMarker(() => 'HIT'),
    } })).toBe(src);
  });
});
