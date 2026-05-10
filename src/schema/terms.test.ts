// Pure language-utility tests. Schema-aware readers (termLabel,
// fieldLabel, termDef) live in lookup.test.ts.

import { test, expect, describe } from 'bun:test';
import {
  deriveLabel,
  smartLabel,
  pluralizeLabel,
  pickAOrAn,
  cap,
} from './terms';

describe('deriveLabel', () => {
  test('snake_case → Title Case', () => {
    expect(deriveLabel('monthly_fee')).toBe('Monthly Fee');
    expect(deriveLabel('agreement')).toBe('Agreement');
    expect(deriveLabel('disclosing_party')).toBe('Disclosing Party');
  });

  test('drops empty segments from doubled underscores', () => {
    expect(deriveLabel('foo__bar')).toBe('Foo Bar');
  });

  test('handles single-character keys', () => {
    expect(deriveLabel('x')).toBe('X');
  });
});

describe('smartLabel', () => {
  test('curlifies straight double quotes', () => {
    expect(smartLabel('the "Customer"')).toBe('the “Customer”');
  });

  test('curlifies straight single quotes when surrounded by non-words', () => {
    expect(smartLabel("the 'Customer'")).toBe('the ‘Customer’');
  });

  test('leaves apostrophes inside words alone', () => {
    expect(smartLabel("Writer's Share")).toBe("Writer's Share");
  });

  test('passes through empty strings', () => {
    expect(smartLabel('')).toBe('');
  });
});

describe('pluralizeLabel', () => {
  test('y → ies after a consonant', () => {
    expect(pluralizeLabel('party')).toBe('parties');
    expect(pluralizeLabel('Country')).toBe('Countries');
  });

  test('y after a vowel just adds s', () => {
    expect(pluralizeLabel('day')).toBe('days');
  });

  test('s/x/z/ch/sh → es', () => {
    expect(pluralizeLabel('box')).toBe('boxes');
    expect(pluralizeLabel('church')).toBe('churches');
    expect(pluralizeLabel('dish')).toBe('dishes');
    expect(pluralizeLabel('class')).toBe('classes');
  });

  test('default: just add s', () => {
    expect(pluralizeLabel('Customer')).toBe('Customers');
    expect(pluralizeLabel('Recording')).toBe('Recordings');
  });
});

describe('pickAOrAn', () => {
  test('vowel-initial → an', () => {
    expect(pickAOrAn('agreement')).toBe('an');
    expect(pickAOrAn('Initial Term')).toBe('an');
  });

  test('consonant-initial → a', () => {
    expect(pickAOrAn('Customer')).toBe('a');
    expect(pickAOrAn('Recording')).toBe('a');
  });

  test('silent-h exceptions get `an`', () => {
    expect(pickAOrAn('honor')).toBe('an');
    expect(pickAOrAn('hour')).toBe('an');
    expect(pickAOrAn('honest opinion')).toBe('an');
  });

  test('yoo-/wuh-sound exceptions get `a`', () => {
    expect(pickAOrAn('user')).toBe('a');
    expect(pickAOrAn('unicorn')).toBe('a');
    expect(pickAOrAn('one-time payment')).toBe('a');
    expect(pickAOrAn('euro')).toBe('a');
  });
});

describe('cap', () => {
  test('uppercases first character', () => {
    expect(cap('foo')).toBe('Foo');
  });

  test('safe on empty string', () => {
    expect(cap('')).toBe('');
  });

  test('leaves already-capitalized strings alone', () => {
    expect(cap('Foo')).toBe('Foo');
  });
});
