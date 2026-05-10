// Term-helper tests. The label resolution rules are non-obvious — these
// tests are the contract for what termLabel does in each schema shape.

import { test, expect, describe } from 'bun:test';
import {
  deriveLabel,
  smartLabel,
  pluralizeLabel,
  pickAOrAn,
  cap,
  termLabel,
  fieldLabel,
  termDef,
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
