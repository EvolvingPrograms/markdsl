// Lookup + format + schema-reader tests. The behavior matrix for
// `formatValue` and `termLabel` is non-obvious; treating these tests
// as the contract.

import { test, expect, describe } from 'bun:test';
import {
  lookupValue,
  formatValue,
  foldLines,
  termLabel,
  fieldLabel,
  termDef,
} from './lookup';

describe('lookupValue', () => {
  test('exact-key match wins', () => {
    expect(lookupValue('customer', { customer: 'Acme' })).toBe('Acme');
  });

  test('case-insensitive fallback when no exact match', () => {
    expect(lookupValue('customer', { Customer: 'Acme' })).toBe('Acme');
    expect(lookupValue('Customer', { customer: 'Acme' })).toBe('Acme');
  });

  test('returns undefined when no key matches', () => {
    expect(lookupValue('absent', { customer: 'Acme' })).toBeUndefined();
  });

  test('returns the raw value (preserves arrays / null / etc.)', () => {
    expect(lookupValue('items', { items: [1, 2, 3] })).toEqual([1, 2, 3]);
    expect(lookupValue('cleared', { cleared: null })).toBeNull();
  });

  test('exact match is preferred over a case-insensitive match (no double-read)', () => {
    expect(lookupValue('foo', { foo: 'lower', FOO: 'upper' })).toBe('lower');
  });
});

describe('formatValue', () => {
  test('strings: trimmed, internal whitespace folded', () => {
    expect(formatValue('  hello   world  ')).toBe('hello world');
    expect(formatValue('one\n  two\n  three')).toBe('one two three');
  });

  test('null / undefined / empty / whitespace-only → null', () => {
    expect(formatValue(null)).toBeNull();
    expect(formatValue(undefined)).toBeNull();
    expect(formatValue('')).toBeNull();
    expect(formatValue('   ')).toBeNull();
    expect(formatValue('\n\t  ')).toBeNull();
  });

  test('numbers and booleans coerce to string', () => {
    expect(formatValue(42)).toBe('42');
    expect(formatValue(true)).toBe('true');
    expect(formatValue(0)).toBe('0');
  });

  test('arrays of scalars: English-list joining', () => {
    expect(formatValue(['Alice'])).toBe('Alice');
    expect(formatValue(['Alice', 'Bob'])).toBe('Alice and Bob');
    expect(formatValue(['Alice', 'Bob', 'Carol'])).toBe('Alice, Bob, and Carol');
    expect(formatValue(['Alice', 'Bob', 'Carol', 'Dave'])).toBe('Alice, Bob, Carol, and Dave');
  });

  test('array with empty / null entries: filters them out before joining', () => {
    expect(formatValue(['', 'Alice', null, 'Bob'])).toBe('Alice and Bob');
  });

  test('arrays containing objects → null (catalog data, not prose)', () => {
    expect(formatValue([{ name: 'Alice' }, { name: 'Bob' }])).toBeNull();
  });

  test('objects → null', () => {
    expect(formatValue({ a: 1 })).toBeNull();
  });

  test('empty array → null', () => {
    expect(formatValue([])).toBeNull();
  });

  test('array of all-empty strings → null', () => {
    expect(formatValue(['', '   ', null])).toBeNull();
  });
});

describe('foldLines', () => {
  test('collapses runs of whitespace', () => {
    expect(foldLines('a   b\n\nc\t\td')).toBe('a b c d');
  });

  test('trims leading + trailing whitespace', () => {
    expect(foldLines('   hello   ')).toBe('hello');
  });

  test('safe on empty string', () => {
    expect(foldLines('')).toBe('');
  });
});

describe('termLabel', () => {
  test('returns smart-quoted entry.term when set', () => {
    expect(termLabel('agreement', {
      agreement: { term: 'Master Service Agreement' },
    })).toBe('Master Service Agreement');
  });

  test('falls back to snake → Title when entry has no term', () => {
    expect(termLabel('monthly_fee', { monthly_fee: { def: 'fixed amount' } })).toBe('Monthly Fee');
  });

  test('bidirectional plural lookup: `parties` → pluralize(party.term)', () => {
    expect(termLabel('parties', {
      party: { term: 'Party' },
    })).toBe('Parties');
  });

  test('bidirectional plural lookup respects explicit irregular plural', () => {
    expect(termLabel('people', {
      person: { term: 'Person', plural: 'People' },
    })).toBe('People');
  });

  test('bidirectional singular lookup: `recording` → singularize(recordings.term)', () => {
    expect(termLabel('recording', {
      recordings: { term: 'Recordings' },
    })).toBe('Recording');
  });

  test('falls all the way through to snake → Title with no schema hit', () => {
    expect(termLabel('foo_bar_baz', { other_key: { term: 'X' } })).toBe('Foo Bar Baz');
  });

  test('returns snake → Title with no schema at all', () => {
    expect(termLabel('foo_bar', undefined)).toBe('Foo Bar');
  });

  test('bare-string schema entry just falls back to snake → Title', () => {
    expect(termLabel('field_name', { field_name: 'string' })).toBe('Field Name');
  });
});

describe('fieldLabel', () => {
  test('description wins over term', () => {
    expect(fieldLabel('writer', {
      writer: { description: 'Writer legal name', term: 'Writer' },
    })).toBe('Writer legal name');
  });

  test('term wins over snake → Title when no description', () => {
    expect(fieldLabel('m_f', {
      m_f: { term: 'Monthly Fee' },
    })).toBe('Monthly Fee');
  });

  test('falls back to snake → Title with no entry', () => {
    expect(fieldLabel('effective_date', undefined)).toBe('Effective Date');
  });
});

describe('termDef', () => {
  test('returns smart-quoted def when set', () => {
    expect(termDef('agreement', {
      agreement: { def: 'a "Master Service Agreement"' },
    })).toBe('a “Master Service Agreement”');
  });

  test('returns undefined when no def', () => {
    expect(termDef('agreement', { agreement: { term: 'X' } })).toBeUndefined();
  });

  test('returns undefined for missing schema entry', () => {
    expect(termDef('agreement', {})).toBeUndefined();
    expect(termDef('agreement', undefined)).toBeUndefined();
  });
});
