// Shared helpers for the docx renderer tests. Render an inline body
// (or a full source with front-matter) to a docx Buffer, extract
// `word/document.xml`, and provide a `plain()` that strips XML tags
// for assertion-friendly text matching.

import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

import { renderMarkdownToBuffer, type RenderMarkdownOptions } from './render';

export const OUT = path.resolve(import.meta.dir, '../../out/tests');

fs.mkdirSync(OUT, { recursive: true });

/** Extract `word/document.xml` from a generated .docx Buffer via the
 *  system `unzip`. Writes the buffer to OUT/<name>.docx as a side
 *  effect so failing tests leave an artifact to inspect. */
export function bufferToXml(buf: Buffer, name: string): string {
  const out = path.resolve(OUT, `${name}.docx`);
  fs.writeFileSync(out, buf);
  return execSync(`unzip -p "${out}" word/document.xml`, { encoding: 'utf8' });
}

/** Render an inline body to docx and return its document.xml.
 *  Wraps the body with a minimal front-matter (title only) so block
 *  tests can run without boilerplate. */
export async function renderToXml(
  name: string,
  body: string,
  opts: RenderMarkdownOptions = {},
): Promise<string> {
  const src = `---\ntitle: TEST\n---\n\n${body}\n`;
  const buf = await renderMarkdownToBuffer(src, opts);
  return bufferToXml(buf, name);
}

/** Render a full markdown source (with its own front-matter) to docx
 *  and return its document.xml. */
export async function renderSourceToXml(
  name: string,
  src: string,
  opts: RenderMarkdownOptions = {},
): Promise<string> {
  const buf = await renderMarkdownToBuffer(src, opts);
  return bufferToXml(buf, name);
}

/** Strip XML tags AND decode common entities so assertions target
 *  rendered plain text. Also normalizes pandoc's no-break spaces
 *  (`+smart` inserts these after abbreviations like "c. ") to regular
 *  spaces so assertions can use plain ASCII spaces. */
export const plain = (xml: string): string =>
  xml
    .replace(/<[^>]+>/g, '')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/ /g, ' ');
