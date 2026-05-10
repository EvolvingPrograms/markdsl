// Lookup + format tests. The behavior matrix for `formatValue` is
// non-obvious; treating these tests as the contract.

import { test, expect, describe } from 'bun:test';
import { lookupValue, formatValue, foldLines } from './lookup';

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
