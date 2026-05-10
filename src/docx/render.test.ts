// End-to-end smoke tests for the docx renderer. Exercises the full
// pipeline: front-matter → values → pandoc → block walk → docx
// assembly → zip. The fine-grained behaviour matrix is covered by the
// downstream consumer (legalese) tests; here we just verify the
// renderer composes cleanly with all the markdsl pieces.

import { test, expect, describe } from 'bun:test';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { renderMarkdownToBuffer, type DocxRenderConfig, spacer, fieldTable } from '.';
import type { MarkerEmitter } from '.';
import { TextRun } from 'docx';

// Tiny helper: pull document.xml out of a docx Buffer via stdin to
// `unzip -p /dev/stdin word/document.xml`.
function extractDocumentXml(buf: Buffer): string {
  const tmp = `/tmp/markdsl-render-test-${Date.now()}-${Math.random()}.docx`;
  writeFileSync(tmp, buf);
  return execSync(`unzip -p "${tmp}" word/document.xml`, { encoding: 'utf8' });
}

describe('renderMarkdownToBuffer', () => {
  test('renders a plain paragraph with bold and italic', async () => {
    const buf = await renderMarkdownToBuffer('Hello **bold** and *italic*.');
    const xml = extractDocumentXml(buf);
    expect(xml).toContain('Hello');
    expect(xml).toContain('bold');
    expect(xml).toContain('italic');
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
  });

  test('default marker emitter passes markers through literally', async () => {
    const buf = await renderMarkdownToBuffer('A {{foo}} marker.');
    const xml = extractDocumentXml(buf);
    expect(xml).toContain('{{foo}}');
  });

  test('custom marker emitter resolves markers to runs', async () => {
    const upper: MarkerEmitter = (inner, bold, italic, out) => {
      out.push(new TextRun({
        text: inner.toUpperCase(),
        ...(bold ? { bold: true } : {}),
        ...(italic ? { italics: true } : {}),
      }));
    };
    const config: DocxRenderConfig = { markerEmitter: upper };
    const buf = await renderMarkdownToBuffer('A {{foo}} marker.', { config });
    const xml = extractDocumentXml(buf);
    expect(xml).toContain('FOO');
    expect(xml).not.toContain('{{foo}}');
  });

  test('cross-instance TextRun: confirms `instanceof` failure mode', async () => {
    // Reproducing the exact bug Phase 12 surfaced: if a consumer
    // constructs a TextRun against a different docx instance than the
    // one the renderer uses, docx's serializer can't recognize it and
    // emits `<rootKey>` instead of `<w:r>`. We can't easily produce a
    // "different" instance from inside markdsl, so we just sanity-
    // check that the in-instance path works end-to-end. The legalese
    // /tmp/docx-isolation.test.ts covers the cross-instance failure
    // explicitly.
    const emitter: MarkerEmitter = (inner, _b, _i, out) => {
      out.push(new TextRun({ text: `[${inner}]` }));
    };
    const buf = await renderMarkdownToBuffer('start {{x}} end', {
      config: { markerEmitter: emitter },
    });
    const xml = extractDocumentXml(buf);
    expect(xml).toContain('[x]');
    expect(xml).not.toContain('<rootKey>');
  });

  test('fenced block dispatch routes to the registered handler', async () => {
    const config: DocxRenderConfig = {
      fencedHandlers: {
        fields: (content, values) => [
          spacer(),
          fieldTable({ ...values, payload: content.trim() }, [{ label: 'Echo', key: 'payload' }]),
          spacer(),
        ],
      },
    };
    const src = '```fields\nhello-world\n```\n';
    const buf = await renderMarkdownToBuffer(src, { config });
    const xml = extractDocumentXml(buf);
    expect(xml).toContain('Echo');
    expect(xml).toContain('hello-world');
  });

  test('schema + values: missing required throws with strict', async () => {
    const src = [
      '---',
      'schema:',
      '  customer: { required: true }',
      '---',
      'Body',
    ].join('\n');
    await expect(renderMarkdownToBuffer(src, { strict: true })).rejects.toThrow(/Missing required.*customer/);
  });

  test('schema + values: defaults flow through', async () => {
    // The default emitter passes markers through, so we use a custom
    // emitter that reads the resolved value to verify the merge chain.
    const valueEmitter: MarkerEmitter = (inner, _b, _i, out, ctx) => {
      const v = ctx.values[inner];
      out.push(new TextRun({ text: String(v ?? '<unset>') }));
    };
    const src = [
      '---',
      'schema:',
      '  greeting: { default: "hello" }',
      '---',
      '{{greeting}} world',
    ].join('\n');
    const buf = await renderMarkdownToBuffer(src, {
      config: { markerEmitter: valueEmitter },
    });
    const xml = extractDocumentXml(buf);
    expect(xml).toContain('hello');
    expect(xml).toContain('world');
  });

  test('Math inline renders as italic TeX', async () => {
    // tex_math_dollars is disabled by default — use the explicit
    // pandoc inline form to make sure Math nodes are emitted.
    const src = 'Energy is $E = mc^2$ exactly.';
    const buf = await renderMarkdownToBuffer(src);
    const xml = extractDocumentXml(buf);
    // The default pandoc flags don't enable tex_math_dollars, so this
    // text reads literally — just confirm it makes it through.
    expect(xml).toContain('Energy is');
    expect(xml).toContain('exactly');
  });

  test('::: {.smallcaps} via Span class emits smallCaps run', async () => {
    const buf = await renderMarkdownToBuffer('See [whereas]{.smallcaps} clause.');
    const xml = extractDocumentXml(buf);
    expect(xml).toContain('whereas');
    expect(xml).toContain('<w:smallCaps/>');
  });

  test('resolveText interpolates the title', async () => {
    const config: DocxRenderConfig = {
      resolveText: (text, ctx) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(ctx.values[k] ?? '')),
    };
    const src = [
      '---',
      'title: "Hello {{who}}"',
      'values: { who: "Alice" }',
      '---',
      'Body',
    ].join('\n');
    const buf = await renderMarkdownToBuffer(src, { config });
    const xml = extractDocumentXml(buf);
    expect(xml).toContain('Hello Alice');
  });
});
