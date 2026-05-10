// runPandoc tests. These require the system `pandoc` binary on PATH;
// CI and dev-machine setups generally have it. If absent, the spawn
// throws and the tests fail loudly — which is the right behavior for
// a Node-only engine that's documented as requiring the binary.

import { test, expect, describe } from 'bun:test';
import { runPandoc } from './runPandoc';

describe('runPandoc', () => {
  test('returns a PandocAst with a top-level `blocks` array', () => {
    const ast = runPandoc('# Heading\n\nBody.\n');
    expect(Array.isArray(ast.blocks)).toBe(true);
    expect(ast.blocks.length).toBe(2);
    expect(ast.blocks[0]?.t).toBe('Header');
    expect(ast.blocks[1]?.t).toBe('Para');
  });

  test('preserves literal `$` (tex_math_dollars disabled)', () => {
    // The framework's marker grammar uses `{{$X}}` — pandoc must NOT
    // treat the surrounding `$` as inline math delimiters.
    const ast = runPandoc('See {{$customer}} and {{$contractor}}.\n');
    const json = JSON.stringify(ast);
    expect(json).not.toContain('"Math"');
    expect(json).toContain('{{$customer}}');
  });

  test('parses fancy_lists (a. b. c. lettered ordered list)', () => {
    const ast = runPandoc('a. first\nb. second\nc. third\n');
    const ordered = ast.blocks.find((b) => b.t === 'OrderedList');
    expect(ordered).toBeDefined();
    const c = ordered?.c as [{ 1: { t: string } }, unknown];
    expect((c[0] as unknown as [number, { t: string }, unknown])[1].t).toBe('LowerAlpha');
  });

  test('parses bracketed_spans ([text]{.class}) into the appropriate node', () => {
    // Pandoc has a dedicated `Underline` AST node for `.underline`
    // (since pandoc 2.10) rather than a generic Span. Other classes
    // surface as Span. Either is fine — the `+bracketed_spans`
    // extension is what enables the syntax.
    const underlineAst = runPandoc('See [EXHIBIT A]{.underline}.\n');
    const json1 = JSON.stringify(underlineAst);
    expect(json1.includes('"Underline"') || json1.includes('"Span"')).toBe(true);

    const customAst = runPandoc('See [EXHIBIT A]{.custom-class}.\n');
    const json2 = JSON.stringify(customAst);
    expect(json2).toContain('"Span"');
    expect(json2).toContain('"custom-class"');
  });

  test('applies +smart (curly quotes / em dashes)', () => {
    const ast = runPandoc('"Quoted" and -- dashed.\n');
    const json = JSON.stringify(ast);
    expect(json).toContain('"Quoted"');
  });

  test('returns an empty blocks array for empty input', () => {
    const ast = runPandoc('');
    expect(ast.blocks).toEqual([]);
  });
});
