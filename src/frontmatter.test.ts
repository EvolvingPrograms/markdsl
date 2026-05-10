// Front-matter splitting is the first stage of the markdsl pipeline; every
// downstream stage (schema resolution, marker substitution, pandoc
// invocation) operates on the `{ meta, body }` it produces. Edge cases
// here are worth being explicit about.

import { test, expect, describe } from 'bun:test';
import { splitFrontMatter } from './frontmatter';

describe('splitFrontMatter', () => {
  test('returns empty meta and full source body when no front-matter present', () => {
    const src = '# Heading\n\nBody text.\n';
    const { meta, body } = splitFrontMatter(src);
    expect(meta).toEqual({});
    expect(body).toBe(src);
  });

  test('parses a basic YAML mapping front-matter', () => {
    const src = ['---', 'title: Test', 'value: 42', '---', '', 'Body.'].join('\n');
    const { meta, body } = splitFrontMatter(src);
    expect(meta).toEqual({ title: 'Test', value: 42 });
    expect(body).toBe('\nBody.');
  });

  test('returns empty meta object for empty front-matter (--- / ---)', () => {
    const src = ['---', '---', 'Body.'].join('\n');
    const { meta, body } = splitFrontMatter(src);
    expect(meta).toEqual({});
    expect(body).toBe('Body.');
  });

  test('accepts `...` as a closing fence (YAML document end)', () => {
    const src = ['---', 'title: Test', '...', 'Body.'].join('\n');
    const { meta, body } = splitFrontMatter(src);
    expect(meta).toEqual({ title: 'Test' });
    expect(body).toBe('Body.');
  });

  test('throws on unterminated front-matter to surface authoring mistakes', () => {
    // If we silently treated this as body, the YAML keys would render as
    // markdown prose — that's worse than an error.
    const src = '---\ntitle: Test\nbody never closes\n';
    expect(() => splitFrontMatter(src)).toThrow(/not closed/);
  });

  test('only treats `---` at column 0 as a fence (literal `---` in a value is safe)', () => {
    const src = [
      '---',
      'note: "  --- inside a quoted string"',
      'sep: "---"',
      '---',
      'Body.',
    ].join('\n');
    const { meta, body } = splitFrontMatter(src);
    expect(meta).toEqual({ note: '  --- inside a quoted string', sep: '---' });
    expect(body).toBe('Body.');
  });

  test('strips a leading UTF-8 BOM before the front-matter check', () => {
    // Common gotcha from Windows / some editors: a BOM byte sneaks in and
    // defeats the literal `---` start check. We strip it.
    const src = '﻿---\ntitle: Test\n---\nBody.';
    const { meta, body } = splitFrontMatter(src);
    expect(meta).toEqual({ title: 'Test' });
    expect(body).toBe('Body.');
  });

  test('handles CRLF line endings', () => {
    const src = '---\r\ntitle: Test\r\n---\r\nBody.\r\n';
    const { meta, body } = splitFrontMatter(src);
    expect(meta).toEqual({ title: 'Test' });
    // Body is preserved as-is, with whatever line endings followed the
    // closing fence.
    expect(body).toContain('Body.');
  });

  test('does NOT strip a leading blank line — front-matter must start at line 1', () => {
    const src = '\n---\ntitle: Test\n---\nBody.';
    const { meta, body } = splitFrontMatter(src);
    expect(meta).toEqual({});
    expect(body).toBe(src);
  });

  test('throws when the front-matter parses to a non-object (array / scalar)', () => {
    const arrSrc = ['---', '- one', '- two', '---', 'Body.'].join('\n');
    expect(() => splitFrontMatter(arrSrc)).toThrow(/mapping/);

    const scalarSrc = ['---', '"just a string"', '---', 'Body.'].join('\n');
    expect(() => splitFrontMatter(scalarSrc)).toThrow(/mapping/);
  });

  test('respects caller-supplied generic type for meta', () => {
    interface MyMeta { title: string; count: number }
    const src = ['---', 'title: Hello', 'count: 3', '---', 'Body.'].join('\n');
    const { meta } = splitFrontMatter<MyMeta>(src);
    // Compile-time check: TS infers the typed shape on `meta`.
    const t: string = meta.title;
    const n: number = meta.count;
    expect(t).toBe('Hello');
    expect(n).toBe(3);
  });

  test('preserves body content verbatim including trailing newlines', () => {
    const src = '---\nx: 1\n---\nLine 1\nLine 2\n\n';
    const { body } = splitFrontMatter(src);
    expect(body).toBe('Line 1\nLine 2\n\n');
  });
});
