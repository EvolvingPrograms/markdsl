// Lettered lists must restart at (a) per list — the legal-doc convention.
// Without a unique numbering instance per list() call, all lettered paragraphs
// share one counter and the second list picks up at (c)(d), the third at (e),
// etc. The fix in blocks/paragraphs/index.ts assigns each list() call its
// own numbering instance.

import { test, expect } from 'bun:test';
import { execSync } from 'node:child_process';
import path from 'node:path';

import { renderMarkdown } from './render';
import { OUT, renderToXml, renderSourceToXml } from './_test-helpers';

test('three consecutive lettered lists each get a fresh numbering instance', async () => {
  const xml = await renderToXml(
    '_list_reset',
    [
      '## Section 4',
      '',
      'a. first',
      'b. second',
      '',
      '## Section 5',
      '',
      'a. fresh',
      'b. start',
      '',
      '## Section 6',
      '',
      'a. another',
      'b. one',
    ].join('\n'),
  );

  // Each list paragraph references a numbering instance via <w:numId w:val="N"/>.
  // Three separate list() calls must produce three distinct numIds, otherwise
  // docx renders them as one continuous list and the (a)(b)(c) counter doesn't
  // reset between sections.
  const numIds = [...xml.matchAll(/<w:numId\s+w:val="(\d+)"/g)].map((m) => m[1]);
  const unique = new Set(numIds);

  expect(numIds.length).toBe(6); // 2 items × 3 lists
  expect(unique.size).toBe(3);   // 3 distinct list instances
});

// — Top-level decimal vs lettered ordered lists —

test('`1. 2. 3.` markdown renders as top-level numbered (decimal) list', async () => {
  const xml = await renderToXml('_top_decimal', [
    '1. First section.',
    '2. Second section.',
    '3. Third section.',
  ].join('\n'));
  // Decimal lists reference the toplist numbering config; lettered references
  // the sublist config. Easiest signal: check the abstractNum format that gets
  // wired up. Actually simpler: numbered items should all share one numId.
  const numIds = [...xml.matchAll(/<w:numId\s+w:val="(\d+)"/g)].map((m) => m[1]);
  expect(numIds.length).toBe(3);
  expect(new Set(numIds).size).toBe(1);  // all three items share one instance
});

test('`a. b. c.` markdown renders as lettered (LowerAlpha) sub-list', async () => {
  // Pandoc's fancy_lists extension parses `a. b.` as LowerAlpha ordered list.
  // We dispatch those to the lettered sublist format. Both `a.` and `1.` lists
  // emit valid numId references — distinguishing them via numId alone is
  // brittle, so this just verifies the items render as a list with a single
  // numbering instance shared across siblings.
  const xml = await renderToXml('_top_alpha', [
    'a. first',
    'b. second',
    'c. third',
  ].join('\n'));
  const numIds = [...xml.matchAll(/<w:numId\s+w:val="(\d+)"/g)].map((m) => m[1]);
  expect(numIds.length).toBe(3);
  expect(new Set(numIds).size).toBe(1);
});

// — Nested sub-list inside a numbered item —

test('lettered sub-list nested under a `1.` item renders as additional paragraphs after the parent item', async () => {
  const xml = await renderToXml('_nested_sublist', [
    '1. **Top item one.** Lead-in text:',
    '',
    '   a. sub-item alpha',
    '   b. sub-item beta',
    '',
    '2. **Top item two.** More text.',
  ].join('\n'));
  // Two distinct numbering instances: one for the top-level (1)(2) sequence,
  // one for the nested (a)(b) sequence. Total 4 list paragraphs.
  const numIds = [...xml.matchAll(/<w:numId\s+w:val="(\d+)"/g)].map((m) => m[1]);
  expect(numIds.length).toBe(4);   // 2 top + 2 sub
  expect(new Set(numIds).size).toBe(2);  // 2 distinct instances
});

// — Justified alignment on list items —

test('list items render with justified alignment', async () => {
  const xml = await renderToXml('_list_justify', [
    '1. A list item with text long enough to wrap when rendered at body width.',
    '',
    'a. Lettered item with similarly long text.',
  ].join('\n'));
  // Both list paragraphs should carry <w:jc w:val="both"/> (justified).
  // docx-js emits "both" for AlignmentType.JUSTIFIED.
  const justifyMatches = [...xml.matchAll(/<w:jc\s+w:val="both"\s*\/>/g)];
  expect(justifyMatches.length).toBeGreaterThanOrEqual(2);
});

// — Indent levels: sub-list deeper than top-level —

test('numbering definitions: top-level decimal at 540, sub-letter at 900', async () => {
  // Numbering indent is configured per-reference in build.ts and emitted
  // into word/numbering.xml when the doc is packed.
  
  
  

  const out = path.resolve(OUT, '_indent_levels.docx');
  await renderMarkdown([
    '---', 'title: TEST', '---',
    '',
    '1. Top item.',
    '',
    '   a. Sub item.',
  ].join('\n'), { output: out, baseDir: process.cwd() });

  const numXml = execSync(`unzip -p "${out}" word/numbering.xml`).toString();
  // Top-level decimal: hanging 540, left 540 → marker at 0, body at 540.
  // Sub-letter: hanging 360, left 900 → marker at 540, body at 900.
  expect(numXml).toMatch(/<w:ind\s+w:left="540"\s+w:hanging="540"\s*\/>/);
  expect(numXml).toMatch(/<w:ind\s+w:left="900"\s+w:hanging="360"\s*\/>/);
});

test('frontmatter `style.list` overrides take effect in numbering.xml', async () => {
  
  
  

  const out = path.resolve(OUT, '_style_overrides.docx');
  await renderMarkdown([
    '---',
    'title: TEST',
    'style:',
    '  list:',
    '    indent: 1080',
    '    sub_indent: 1440',
    '    sub_hanging: 540',
    '    bold_marker: false',
    '---',
    '',
    '1. Top item.',
    '',
    '   a. Sub item.',
  ].join('\n'), { output: out, baseDir: process.cwd() });

  const numXml = execSync(`unzip -p "${out}" word/numbering.xml`).toString();
  // Top-level decimal: hanging 1080, left 1080.
  expect(numXml).toMatch(/<w:ind\s+w:left="1080"\s+w:hanging="1080"\s*\/>/);
  // Sub-letter: hanging 540, left 1440.
  expect(numXml).toMatch(/<w:ind\s+w:left="1440"\s+w:hanging="540"\s*\/>/);
  // bold_marker: false → no <w:b/> in the level run-style.
  const topLevelMatch = numXml.match(/<w:abstractNum[^>]*>[\s\S]*?<w:lvlText\s+w:val="%1\."[\s\S]*?<\/w:lvl>/);
  expect(topLevelMatch).not.toBeNull();
  expect(topLevelMatch![0]).not.toMatch(/<w:b\b/);
});

test('frontmatter `style.font` overrides the body font family', async () => {
  
  
  

  const out = path.resolve(OUT, '_style_font.docx');
  await renderMarkdown([
    '---',
    'title: TEST',
    'style:',
    '  font: Garamond',
    '---',
    '',
    'Body.',
  ].join('\n'), { output: out, baseDir: process.cwd() });

  const stylesXml = execSync(`unzip -p "${out}" word/styles.xml`).toString();
  expect(stylesXml).toContain('Garamond');
});

test('frontmatter `style.size` overrides body font size in points', async () => {
  
  
  

  const out = path.resolve(OUT, '_style_size.docx');
  await renderMarkdown([
    '---',
    'title: TEST',
    'style:',
    '  size: 11',
    '---',
    '',
    'Body.',
  ].join('\n'), { output: out, baseDir: process.cwd() });

  const stylesXml = execSync(`unzip -p "${out}" word/styles.xml`).toString();
  // 11pt → 22 half-points. Default is 24 (12pt).
  expect(stylesXml).toMatch(/<w:sz\s+w:val="22"/);
});

test('frontmatter `style.margin` (single number) sets all four margins', async () => {
  
  
  

  const out = path.resolve(OUT, '_style_margin_uniform.docx');
  await renderMarkdown([
    '---',
    'title: TEST',
    'style:',
    '  margin: 1080',
    '---',
    '',
    'Body.',
  ].join('\n'), { output: out, baseDir: process.cwd() });

  const docXml = execSync(`unzip -p "${out}" word/document.xml`).toString();
  expect(docXml).toMatch(/<w:pgMar[^>]*w:top="1080"/);
  expect(docXml).toMatch(/<w:pgMar[^>]*w:bottom="1080"/);
  expect(docXml).toMatch(/<w:pgMar[^>]*w:left="1080"/);
  expect(docXml).toMatch(/<w:pgMar[^>]*w:right="1080"/);
});

test('frontmatter `style.margin` (object) sets per-side margins', async () => {
  
  
  

  const out = path.resolve(OUT, '_style_margin_per_side.docx');
  await renderMarkdown([
    '---',
    'title: TEST',
    'style:',
    '  margin:',
    '    top: 1440',
    '    bottom: 1440',
    '    left: 1800',
    '    right: 1800',
    '---',
    '',
    'Body.',
  ].join('\n'), { output: out, baseDir: process.cwd() });

  const docXml = execSync(`unzip -p "${out}" word/document.xml`).toString();
  expect(docXml).toMatch(/<w:pgMar[^>]*w:top="1440"/);
  expect(docXml).toMatch(/<w:pgMar[^>]*w:left="1800"/);
});

test('frontmatter `style.spacing` overrides default paragraph spacing', async () => {
  
  
  

  const out = path.resolve(OUT, '_style_spacing.docx');
  await renderMarkdown([
    '---',
    'title: TEST',
    'style:',
    '  spacing:',
    '    before: 60',
    '    after: 60',
    '    line: 480',
    '---',
    '',
    'Body.',
  ].join('\n'), { output: out, baseDir: process.cwd() });

  // Spacing is applied per-body-paragraph (not in styles.xml) so cells
  // and list items don't inherit it. Check the actual body paragraph in
  // document.xml.
  const docXml = execSync(`unzip -p "${out}" word/document.xml`).toString();
  expect(docXml).toMatch(/<w:spacing[^>]*w:before="60"/);
  expect(docXml).toMatch(/<w:spacing[^>]*w:after="60"/);
  expect(docXml).toMatch(/<w:spacing[^>]*w:line="480"/);
});

test('frontmatter `style.gap` overrides empty {.gap} block spacing', async () => {
  const xml = await renderSourceToXml('_style_gap', [
    '---',
    'title: TEST',
    'output: _style_gap.docx',
    'style:',
    '  gap: 480',
    '---',
    '',
    '::: {.gap} :::',
  ].join('\n'));
  // The gap paragraph should have before/after = 480 (attribute order varies).
  expect(xml).toMatch(/<w:spacing[^>]*w:before="480"/);
  expect(xml).toMatch(/<w:spacing[^>]*w:after="480"/);
});

test('frontmatter `style.body.indent` overrides body first-line indent', async () => {
  
  
  

  const out = path.resolve(OUT, '_style_body_indent.docx');
  await renderMarkdown([
    '---',
    'title: TEST',
    'indent: true',
    'style:',
    '  body:',
    '    indent: 360',
    '---',
    '',
    'Body paragraph.',
  ].join('\n'), { output: out, baseDir: process.cwd() });

  const docXml = execSync(`unzip -p "${out}" word/document.xml`).toString();
  expect(docXml).toMatch(/<w:ind\s+w:firstLine="360"\s*\/>/);
});

test('top-level numbered list emits a bold number', async () => {
  
  
  

  const out = path.resolve(OUT, '_bold_number.docx');
  await renderMarkdown([
    '---', 'title: TEST', '---',
    '',
    '1. Item.',
  ].join('\n'), { output: out, baseDir: process.cwd() });

  const numXml = execSync(`unzip -p "${out}" word/numbering.xml`).toString();
  // The TOPLIST_REF level should carry a run style with bold for the marker.
  // docx-js emits this as <w:rPr><w:b/></w:rPr> inside the level's <w:lvl>.
  expect(numXml).toMatch(/<w:lvl[\s\S]*?<w:rPr>[\s\S]*?<w:b\b[\s\S]*?<\/w:rPr>/);
});

// — Complex nested structure: numbered with sublists in multiple items —

test('multiple top-level items each with their own lettered sub-list', async () => {
  const xml = await renderToXml('_complex_nested', [
    '1. **First section.** Lead-in:',
    '',
    '   a. alpha',
    '   b. beta',
    '',
    '2. **Second section.** No sub-list here.',
    '',
    '3. **Third section.** Another lead-in:',
    '',
    '   a. gamma',
    '   b. delta',
    '   c. epsilon',
  ].join('\n'));

  const numIds = [...xml.matchAll(/<w:numId\s+w:val="(\d+)"/g)].map((m) => m[1]);
  // 3 top items + 2 + 3 sub items = 8 list paragraphs
  expect(numIds.length).toBe(8);
  // Distinct instances: 1 top-level + 2 sub-lists (each restarts at "a") = 3
  expect(new Set(numIds).size).toBe(3);
});

// — Bullet lists still work —

test('BulletList markdown renders as lettered list (sublist format)', async () => {
  const xml = await renderToXml('_bullet', [
    '- first',
    '- second',
    '- third',
  ].join('\n'));
  const numIds = [...xml.matchAll(/<w:numId\s+w:val="(\d+)"/g)].map((m) => m[1]);
  expect(numIds.length).toBe(3);
  expect(new Set(numIds).size).toBe(1);
});

// — Sub-list followed by another top-level item: numbering continues correctly —

test('top-level numbering continues across items that have intervening sub-lists', async () => {
  const xml = await renderToXml('_continue', [
    '1. First.',
    '',
    '   a. sub-a',
    '   b. sub-b',
    '',
    '2. Second.',
    '',
    '3. Third.',
  ].join('\n'));
  const numIds = [...xml.matchAll(/<w:numId\s+w:val="(\d+)"/g)].map((m) => m[1]);
  // 3 top + 2 sub = 5 paragraphs.
  expect(numIds.length).toBe(5);
  // All three top-level items must share the same numId so 1.→2.→3. continues.
  // The sub-list has its own. So 2 distinct.
  expect(new Set(numIds).size).toBe(2);
});
