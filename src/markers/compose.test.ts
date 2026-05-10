// Composition tests. Each helper is exercised independently so a
// regression names exactly which one broke.

import { test, expect, describe } from 'bun:test';
import { pickArticle, applyTextCase, emitDefine, emitInline } from './compose';
import { parseMarker } from './parse';

describe('pickArticle', () => {
  test('"the" passes through verbatim regardless of label', () => {
    expect(pickArticle('Customer', 'the')).toBe('the');
    expect(pickArticle('Acme Inc.', 'the')).toBe('the');
  });

  test('"a" before consonant stays "a"', () => {
    expect(pickArticle('Customer', 'a')).toBe('a');
    expect(pickArticle('Recording', 'a')).toBe('a');
  });

  test('"a" before vowel auto-flips to "an"', () => {
    expect(pickArticle('Agreement', 'a')).toBe('an');
    expect(pickArticle('Initial Term', 'a')).toBe('an');
  });

  test('"an" before consonant auto-flips to "a"', () => {
    expect(pickArticle('Customer', 'an')).toBe('a');
  });

  test('null requested → null result (no article)', () => {
    expect(pickArticle('Customer', null)).toBeNull();
  });

  test('respects the silent-h / yoo-sound exceptions from pickAOrAn', () => {
    expect(pickArticle('honor', 'a')).toBe('an');
    expect(pickArticle('user', 'an')).toBe('a');
  });
});

describe('applyTextCase', () => {
  test('upper signal uppercases the whole string', () => {
    const parts = parseMarker('CUSTOMER');
    expect(applyTextCase('acme inc.', parts)).toBe('ACME INC.');
  });

  test('capContent signal capitalizes only the first letter', () => {
    const parts = parseMarker('Customer');
    expect(applyTextCase('the agreement', parts)).toBe('The agreement');
  });

  test('no signals: pass-through', () => {
    const parts = parseMarker('customer');
    expect(applyTextCase('the agreement', parts)).toBe('the agreement');
  });

  test('upper takes precedence over capContent (all-caps marker)', () => {
    // CUSTOMER is both capContent: true and upper: true; upper wins.
    const parts = parseMarker('CUSTOMER');
    expect(applyTextCase('hello world', parts)).toBe('HELLO WORLD');
  });
});

describe('emitDefine', () => {
  test('with article: `(the ***"Label"***)`', () => {
    expect(emitDefine('Customer', 'the')).toBe('(the ***“Customer”***)');
  });

  test('with `a` article', () => {
    expect(emitDefine('Party', 'a')).toBe('(a ***“Party”***)');
  });

  test('without article: just the styled term in parens', () => {
    expect(emitDefine('Term', null)).toBe('(***“Term”***)');
  });
});

describe('emitInline', () => {
  test('with article: `the ***"Label"***` (no parens)', () => {
    expect(emitInline('Customer', 'the')).toBe('the ***“Customer”***');
  });

  test('with capArticle: capitalizes the article', () => {
    expect(emitInline('Customer', 'the', true)).toBe('The ***“Customer”***');
  });

  test('with `a` and capArticle', () => {
    expect(emitInline('Party', 'a', true)).toBe('A ***“Party”***');
  });

  test('without article: just the styled term', () => {
    expect(emitInline('Services', null)).toBe('***“Services”***');
  });
});

describe('integration: typical legalese-style handler composition', () => {
  test('introduce-form pattern: parse → pickArticle → emitDefine', () => {
    // Author writes `{{$the_Customer}}`; dispatch strips `$`; handler
    // gets `the_Customer` and composes:
    const parts = parseMarker('the_Customer');
    const label = 'Customer';                 // from termLabel(...)
    const article = pickArticle(label, parts.article);
    const expansion = 'Acme Inc.';            // from values lookup
    const out = `${applyTextCase(expansion, parts)} ${emitDefine(label, article)}`;
    expect(out).toBe('Acme Inc. (the ***“Customer”***)');
  });

  test('inline-form pattern: parse → pickArticle → emitInline', () => {
    // `{{$a_Party}}` with no value or def → graceful inline fallback.
    const parts = parseMarker('a_Party');
    const label = 'Party';
    const article = pickArticle(label, parts.article);
    expect(emitInline(label, article, parts.capArticle)).toBe('a ***“Party”***');
  });

  test('all-caps form: parse → applyTextCase on a value', () => {
    // `{{=COMPANY}}` style: no article, just uppercase the resolved value.
    const parts = parseMarker('COMPANY');
    const value = 'Acme Inc.';
    expect(applyTextCase(value, parts)).toBe('ACME INC.');
  });
});
