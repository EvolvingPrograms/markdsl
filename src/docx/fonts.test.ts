// Verifies that bundled Google Fonts are actually embedded in the
// rendered .docx when selected via `style.font:` — caught a regression
// where the `fonts/` directory wasn't included in the published
// package, so loading silently fell through to "no embed" and Word
// substituted on open.

import { test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import { renderMarkdownToBuffer } from './render';
import { OUT } from './_test-helpers';

const ROOT = path.resolve(import.meta.dir, '../..');
const FONTS_DIR = path.resolve(ROOT, 'fonts');
const MANIFEST  = path.join(FONTS_DIR, 'manifest.json');

// — Bundled assets shipped with the package —

test('fonts/manifest.json is present', () => {
  expect(fs.existsSync(MANIFEST)).toBe(true);
});

test('every family in the manifest has its TTF on disk', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as {
    family: string; files: string[];
  }[];
  expect(manifest.length).toBeGreaterThan(0);
  for (const fam of manifest) {
    for (const file of fam.files) {
      const tt = path.join(FONTS_DIR, file);
      expect(fs.existsSync(tt), `missing TTF: ${file}`).toBe(true);
      // Sanity: TTF magic header (or OTF "OTTO").
      const head = fs.readFileSync(tt).slice(0, 4);
      const magic = head.readUInt32BE(0);
      const isTTFOrOTF = magic === 0x00010000 || magic === 0x4f54544f;
      expect(isTTFOrOTF, `not a TTF/OTF: ${file}`).toBe(true);
    }
  }
});

test('package.json `files` whitelist includes fonts/', () => {
  // Regression guard: dropping fonts/ from the published package
  // makes embedding silently fall through to Word substitution.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  expect(pkg.files).toContain('fonts/');
});

// — Embedding end-to-end —

async function renderWithFont(name: string, font: string): Promise<string> {
  const out = path.resolve(OUT, `${name}.docx`);
  const buf = await renderMarkdownToBuffer([
    '---',
    'title: TEST',
    'style:',
    `  font: ${font}`,
    '---',
    '',
    'Body paragraph.',
  ].join('\n'), { baseDir: ROOT });
  fs.writeFileSync(out, buf);
  return out;
}

function zipEntries(docxPath: string): string[] {
  return execSync(`unzip -l "${docxPath}"`).toString().split('\n');
}

test('rendering with `style.font: EB Garamond` embeds the font binary in the .docx', async () => {
  const out = await renderWithFont('_font_eb', 'EB Garamond');
  const lines = zipEntries(out);
  // The packed font entry uses sequential `font<N>.odttf` after the
  // dolanmiu/docx#3019 patch.
  expect(lines.some((l) => /word\/fonts\/font\d+\.odttf/.test(l))).toBe(true);
  // The font binary should be non-trivial in size — empty/missing fonts
  // would silently produce a 0-byte entry (or no entry at all).
  const fontLine = lines.find((l) => /word\/fonts\/font\d+\.odttf/.test(l))!;
  const sizeMatch = fontLine.match(/^\s*(\d+)\s/);
  expect(sizeMatch).not.toBeNull();
  expect(Number(sizeMatch![1])).toBeGreaterThan(10000);
});

test('the embedded fontTable.xml declares the requested family with an embedRegular ref', async () => {
  const out = await renderWithFont('_font_table', 'EB Garamond');
  const fontTable = execSync(`unzip -p "${out}" word/fontTable.xml`).toString();
  expect(fontTable).toContain('<w:font w:name="EB Garamond">');
  expect(fontTable).toMatch(/<w:embedRegular[^/]*\/>/);
});

test('the fontTable.xml.rels contains a font relationship pointing to the binary', async () => {
  const out = await renderWithFont('_font_rels', 'EB Garamond');
  const rels = execSync(`unzip -p "${out}" word/_rels/fontTable.xml.rels`).toString();
  expect(rels).toMatch(/Type="[^"]*\/relationships\/font"/);
  expect(rels).toMatch(/Target="fonts\/font\d+\.odttf"/);
});

test('selecting a non-bundled font does NOT embed (Word substitutes)', async () => {
  const out = await renderWithFont('_font_passthrough', 'Times New Roman');
  const lines = zipEntries(out);
  expect(lines.some((l) => /word\/fonts\/font\d+\.odttf/.test(l))).toBe(false);
});

test('every bundled family round-trips through embedding', async () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as {
    family: string; files: string[];
  }[];
  for (const fam of manifest) {
    const out = await renderWithFont(`_font_${fam.family.replace(/\s+/g, '_')}`, fam.family);
    const fontTable = execSync(`unzip -p "${out}" word/fontTable.xml`).toString();
    expect(fontTable, `family not embedded: ${fam.family}`).toContain(
      `<w:font w:name="${fam.family}">`,
    );
    const lines = zipEntries(out);
    expect(
      lines.some((l) => /word\/fonts\/font\d+\.odttf/.test(l)),
      `binary missing for ${fam.family}`,
    ).toBe(true);
  }
});
