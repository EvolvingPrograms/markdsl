// Marker parser tests. Each piece (stripArticlePrefix,
// analyzeCaseSignals, parseMarker) is exercised independently so a
// failure pinpoints the broken layer.

import { test, expect, describe } from 'bun:test';
import {
  stripArticlePrefix,
  analyzeCaseSignals,
  parseMarker,
} from './parse';

describe('stripArticlePrefix', () => {
  test('detects lowercase `the_` prefix', () => {
    expect(stripArticlePrefix('the_customer')).toEqual({
      article: 'the', capArticle: false, rest: 'customer',
    });
  });

  test('detects capitalized `The_` as a sentence-start signal', () => {
    expect(stripArticlePrefix('The_customer')).toEqual({
      article: 'the', capArticle: true, rest: 'customer',
    });
  });

  test('detects `a_` and `an_` prefixes', () => {
    expect(stripArticlePrefix('a_party')).toEqual({
      article: 'a', capArticle: false, rest: 'party',
    });
    expect(stripArticlePrefix('an_initial_term')).toEqual({
      article: 'an', capArticle: false, rest: 'initial_term',
    });
  });

  test('returns null article and unchanged rest when no prefix', () => {
    expect(stripArticlePrefix('customer')).toEqual({
      article: null, capArticle: false, rest: 'customer',
    });
  });

  test('does NOT match prefixes without the underscore (the_ vs theX)', () => {
    expect(stripArticlePrefix('thermometer')).toEqual({
      article: null, capArticle: false, rest: 'thermometer',
    });
    expect(stripArticlePrefix('answer')).toEqual({
      article: null, capArticle: false, rest: 'answer',
    });
  });

  test('only strips ONE prefix even if the rest looks like another', () => {
    // `the_a_party` strips `the_`, leaves `a_party`. Handlers can decide
    // whether to recurse; the parser doesn't.
    expect(stripArticlePrefix('the_a_party')).toEqual({
      article: 'the', capArticle: false, rest: 'a_party',
    });
  });
});

describe('analyzeCaseSignals', () => {
  test('lowercase key has no signals', () => {
    expect(analyzeCaseSignals('customer')).toEqual({ capContent: false, upper: false });
  });

  test('capitalized first letter sets capContent', () => {
    expect(analyzeCaseSignals('Customer')).toEqual({ capContent: true, upper: false });
  });

  test('all-uppercase key sets both capContent and upper', () => {
    expect(analyzeCaseSignals('CUSTOMER')).toEqual({ capContent: true, upper: true });
  });

  test('all-uppercase with underscores still sets upper', () => {
    expect(analyzeCaseSignals('SOME_KEY')).toEqual({ capContent: true, upper: true });
  });

  test('mixed-case (single cap not all-caps) is capContent without upper', () => {
    expect(analyzeCaseSignals('SomeKey')).toEqual({ capContent: true, upper: false });
  });
});

describe('parseMarker', () => {
  test('aggregates strip + case signals on a typical legalese form', () => {
    expect(parseMarker('the_Customer')).toEqual({
      raw: 'the_Customer',
      key: 'customer',
      article: 'the',
      capArticle: false,
      capContent: true,
      upper: false,
      rest: 'Customer',
    });
  });

  test('sentence-start form `The_X`', () => {
    expect(parseMarker('The_Customer')).toEqual({
      raw: 'The_Customer',
      key: 'customer',
      article: 'the',
      capArticle: true,
      capContent: true,
      upper: false,
      rest: 'Customer',
    });
  });

  test('all-uppercase form `KEY` (no article prefix)', () => {
    expect(parseMarker('COMPANY')).toEqual({
      raw: 'COMPANY',
      key: 'company',
      article: null,
      capArticle: false,
      capContent: true,
      upper: true,
      rest: 'COMPANY',
    });
  });

  test('plain lowercase reference `key`', () => {
    expect(parseMarker('customer')).toEqual({
      raw: 'customer',
      key: 'customer',
      article: null,
      capArticle: false,
      capContent: false,
      upper: false,
      rest: 'customer',
    });
  });

  test('trims surrounding whitespace before parsing', () => {
    expect(parseMarker('  the_Customer  ')).toEqual({
      raw: 'the_Customer',
      key: 'customer',
      article: 'the',
      capArticle: false,
      capContent: true,
      upper: false,
      rest: 'Customer',
    });
  });

  test('article prefix `a_` produces lowercase article + cap signal independently', () => {
    expect(parseMarker('a_Party')).toMatchObject({
      article: 'a',
      capArticle: false,
      capContent: true,  // post-strip starts with `P`
      key: 'party',
    });
    expect(parseMarker('An_Initial_term')).toMatchObject({
      article: 'an',
      capArticle: true,
      capContent: true,
      key: 'initial_term',
    });
  });
});
