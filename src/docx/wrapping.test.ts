// Markdown line-break behavior pinned by regression tests.
//
//   - Soft line breaks within a paragraph (no blank line between lines) are
//     joined as spaces, so prose can be hard-wrapped at any column without
//     affecting rendered output.
//   - Lettered/numbered lists require each item on its own line; collapsing
//     items onto a single wrapped paragraph reverts to plain prose with only
//     the first marker treated as a list start.

import { test, expect } from 'bun:test';
import { plain, renderSourceToXml } from './_test-helpers';

test('soft line-wraps within a paragraph join as a single space', async () => {
  const xml = await renderSourceToXml('_wrap_paragraph', [
    '---',
    'title: TEST',
    'output: _wrap_paragraph.docx',
    '---',
    '',
    'This Agreement is made as of the Effective Date stated below, by',
    'the Assignor in favor of the Assignee identified in Section 1.',
  ].join('\n'));

  expect(plain(xml)).toContain(
    'This Agreement is made as of the Effective Date stated below, by the Assignor in favor of the Assignee identified in Section 1.',
  );
});

test('lists require each item on its own line', async () => {
  const xml = await renderSourceToXml('_wrap_list_per_line', [
    '---',
    'title: TEST',
    'output: _wrap_list_per_line.docx',
    '---',
    '',
    'Assignor assigns the following:',
    '',
    'a. All copyrights;',
    'b. The right to license; and',
    'c. The right to enforce copyright.',
  ].join('\n'));

  // Each list item should appear as a distinct (a)/(b)/(c) entry — pandoc
  // recognizes consecutive same-indent lettered lines as one list.
  const body = plain(xml);
  expect(body).toContain('All copyrights;');
  expect(body).toContain('The right to license; and');
  expect(body).toContain('The right to enforce copyright.');
});

test('blank line between lettered list items keeps them as one list', async () => {
  const xml = await renderSourceToXml('_wrap_list_blank_lines_lettered', [
    '---',
    'title: TEST',
    'output: _wrap_list_blank_lines_lettered.docx',
    '---',
    '',
    'Assignor agrees as follows:',
    '',
    'a. All copyrights;',
    '',
    'b. The right to license; and',
    '',
    'c. The right to enforce copyright.',
  ].join('\n'));

  const body = plain(xml);
  // All three items render as separate list entries — no inline "b." / "c." text.
  expect(body).toContain('All copyrights;');
  expect(body).toContain('The right to license; and');
  expect(body).toContain('The right to enforce copyright.');
  // Crucially, "b." and "c." should NOT appear inline (each is a list-item marker).
  expect(body).not.toContain('; b. The right');
  expect(body).not.toContain('; c. The right');
});

test('blank line between numbered list items keeps them as one list', async () => {
  const xml = await renderSourceToXml('_wrap_list_blank_lines_numbered', [
    '---',
    'title: TEST',
    'output: _wrap_list_blank_lines_numbered.docx',
    '---',
    '',
    'The parties agree as follows:',
    '',
    '1. The Term shall be five (5) years.',
    '',
    '2. Compensation shall be paid monthly.',
    '',
    '3. Either party may terminate on notice.',
  ].join('\n'));

  const body = plain(xml);
  expect(body).toContain('The Term shall be five (5) years.');
  expect(body).toContain('Compensation shall be paid monthly.');
  expect(body).toContain('Either party may terminate on notice.');
  expect(body).not.toContain('. 2. Compensation');
  expect(body).not.toContain('. 3. Either');
});

test('collapsing list items into one wrapped paragraph breaks the list', async () => {
  // Wrapping list items so they continue on the previous item's line means
  // pandoc only sees the first "a." as a list start; everything else becomes
  // inline text. This pins the limitation so authors know to keep one-per-line.
  const xml = await renderSourceToXml('_wrap_list_collapsed', [
    '---',
    'title: TEST',
    'output: _wrap_list_collapsed.docx',
    '---',
    '',
    'Assignor assigns the following:',
    '',
    'a. All copyrights; b. The right to license; and c. The right to enforce.',
  ].join('\n'));

  const body = plain(xml);
  // "b." and "c." render as inline text rather than as separate list-item markers.
  expect(body).toContain('b. The right to license');
  expect(body).toContain('c. The right to enforce');
});
