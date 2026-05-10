// Value-resolution tests. Cover the three layers of the merge order
// (defaults → frontmatter → caller), the missing-required surface,
// and the CLI flag parser.

import { test, expect, describe } from 'bun:test';
import { mergeValues, schemaDefaults, missingRequired, parseSetFlag } from './values';

describe('mergeValues', () => {
  test('later sources win over earlier ones', () => {
    expect(mergeValues({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  test('undefined entries do not shadow earlier values', () => {
    expect(mergeValues({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
  });

  test('null DOES shadow earlier values (caller explicitly cleared)', () => {
    // null is a deliberate "no value" signal; undefined is "I didn't say".
    expect(mergeValues({ a: 1 }, { a: null })).toEqual({ a: null });
  });

  test('skips undefined sources entirely', () => {
    expect(mergeValues(undefined, { a: 1 }, undefined)).toEqual({ a: 1 });
  });

  test('returns a fresh object — does not mutate inputs', () => {
    const a = { x: 1 };
    const b = { y: 2 };
    const merged = mergeValues(a, b);
    expect(merged).not.toBe(a);
    expect(merged).not.toBe(b);
    expect(a).toEqual({ x: 1 });
    expect(b).toEqual({ y: 2 });
  });

  test('three-source merge: caller > frontmatter > defaults', () => {
    const defaults  = { a: 'd', b: 'd', c: 'd' };
    const fm        = { a: 'fm',         c: 'fm' };
    const caller    = { a: 'caller'              };
    expect(mergeValues(defaults, fm, caller)).toEqual({
      a: 'caller', b: 'd', c: 'fm',
    });
  });
});

describe('schemaDefaults', () => {
  test('extracts `default:` from schema entries', () => {
    expect(schemaDefaults({
      governing_law: { default: 'State of Delaware' },
      effective_date: { type: 'date' },
      writer_name: { type: 'string', default: 'Anonymous' },
    })).toEqual({
      governing_law: 'State of Delaware',
      writer_name: 'Anonymous',
    });
  });

  test('ignores bare-string entries (no descriptor → no default possible)', () => {
    expect(schemaDefaults({
      bare_field: 'string',
      configured: { default: 42 },
    })).toEqual({ configured: 42 });
  });

  test('returns empty for undefined schema', () => {
    expect(schemaDefaults(undefined)).toEqual({});
  });

  test('preserves non-string defaults verbatim', () => {
    expect(schemaDefaults({
      list_default: { default: [1, 2, 3] },
      bool_default: { default: true },
      null_default: { default: null },
    })).toEqual({
      list_default: [1, 2, 3],
      bool_default: true,
      null_default: null,
    });
  });
});

describe('missingRequired', () => {
  test('flags required keys missing from values', () => {
    const schema = {
      a: { required: true },
      b: { required: true },
      c: { required: false },
      d: 'string',
    };
    expect(missingRequired({ a: 'present' }, schema)).toEqual(['b']);
  });

  test('treats empty string as missing', () => {
    expect(missingRequired({ a: '' }, { a: { required: true } })).toEqual(['a']);
  });

  test('treats null as missing', () => {
    expect(missingRequired({ a: null }, { a: { required: true } })).toEqual(['a']);
  });

  test('non-empty values (including 0 and false) count as supplied', () => {
    const schema = { a: { required: true }, b: { required: true } };
    expect(missingRequired({ a: 0, b: false }, schema)).toEqual([]);
  });

  test('returns sorted keys for stable output', () => {
    const schema = {
      writer: { required: true },
      agreement: { required: true },
      effective_date: { required: true },
    };
    expect(missingRequired({}, schema)).toEqual([
      'agreement', 'effective_date', 'writer',
    ]);
  });

  test('returns empty for undefined schema', () => {
    expect(missingRequired({}, undefined)).toEqual([]);
  });

  test('ignores bare-string entries — they cannot carry `required: true`', () => {
    expect(missingRequired({}, { bare: 'string' })).toEqual([]);
  });
});

describe('parseSetFlag', () => {
  test('splits on the first `=`', () => {
    expect(parseSetFlag('writer_name=Christian Lewis')).toEqual(['writer_name', 'Christian Lewis']);
  });

  test('preserves `=` in the value', () => {
    expect(parseSetFlag('eq=a=b=c')).toEqual(['eq', 'a=b=c']);
  });

  test('throws on a flag with no `=`', () => {
    expect(() => parseSetFlag('no_equals')).toThrow(/expected/);
  });

  test('throws on a flag starting with `=`', () => {
    expect(() => parseSetFlag('=value')).toThrow(/expected/);
  });

  test('accepts an empty value (key=)', () => {
    expect(parseSetFlag('key=')).toEqual(['key', '']);
  });
});
