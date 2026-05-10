// Buffer / file parity for the low-level assembly entry points
// (build, buildToBuffer). The convertMarkdown / browser-subpath
// equivalents live downstream — those depend on DSL-specific config.

import { test, expect, describe } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import { build, buildToBuffer } from './lib';
import { p, h2 } from './blocks';
import { OUT } from './_test-helpers';

const DOCX_ZIP_MAGIC = Buffer.from('PK\x03\x04');

function isValidDocxBytes(buf: Buffer): boolean {
  return buf.subarray(0, 4).equals(DOCX_ZIP_MAGIC) && buf.length > 1000;
}

describe('buildToBuffer / build', () => {
  test('buildToBuffer returns a valid .docx Buffer (zip magic + non-trivial size)', async () => {
    const buf = await buildToBuffer({
      title: 'TEST',
      body: [p('Hello.'), h2('Section 1'), p('Body.')],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(isValidDocxBytes(buf)).toBe(true);
  });

  test('build writes a file whose document.xml matches buildToBuffer output', async () => {
    // Two separate `Packer.toBuffer` calls embed different zip-entry
    // timestamps, so byte-equality is too strict. Compare the rendered
    // word/document.xml instead — that's the part callers care about.
    const args = {
      title: 'PARITY',
      body: [p('First.'), p('Second.')],
    };
    const out  = path.resolve(OUT, '_buffer_parity.docx');
    const out2 = path.resolve(OUT, '_buffer_parity_mem.docx');
    await build({ ...args, output: out });
    const memBytes = await buildToBuffer(args);
    fs.writeFileSync(out2, memBytes);
    const fileXml = execSync(`unzip -p "${out}"  word/document.xml`).toString();
    const memXml  = execSync(`unzip -p "${out2}" word/document.xml`).toString();
    expect(memXml).toBe(fileXml);
  });
});
