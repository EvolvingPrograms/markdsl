// runPandocWasm tests. The WASM engine is optional; if pandoc-wasm
// isn't installed, the suite skips gracefully so a fresh clone with a
// minimal install still passes `bun test`.

import { test, expect, describe } from 'bun:test';

let wasmAvailable = true;
try {
  await import('pandoc-wasm');
} catch {
  wasmAvailable = false;
}

const d = wasmAvailable ? describe : describe.skip;

// Strip pandoc-api-version — it differs between binaries even when the
// AST shape is identical.
function normalize(ast: unknown): unknown {
  if (typeof ast !== 'object' || ast === null) return ast;
  const { 'pandoc-api-version': _v, ...rest } = ast as Record<string, unknown>;
  return rest;
}

d('runPandocWasm', () => {
  test('returns a PandocAst with a `blocks` array', async () => {
    const { runPandocWasm } = await import('./runPandocWasm');
    const ast = await runPandocWasm('# Heading\n\nBody.\n');
    expect(Array.isArray(ast.blocks)).toBe(true);
    expect(ast.blocks[0]?.t).toBe('Header');
  });

  test('AST shape matches runPandoc for the same input', async () => {
    const { runPandocWasm } = await import('./runPandocWasm');
    const { runPandoc } = await import('./runPandoc');
    const src = 'A *plain* paragraph with **emphasis**.\n';
    const sysAst = runPandoc(src);
    const wasmAst = await runPandocWasm(src);
    expect(normalize(wasmAst)).toEqual(normalize(sysAst));
  });

  test('preserves literal `$` like the system engine', async () => {
    const { runPandocWasm } = await import('./runPandocWasm');
    const ast = await runPandocWasm('See {{$customer}} and {{$contractor}}.\n');
    const json = JSON.stringify(ast);
    expect(json).not.toContain('"Math"');
    expect(json).toContain('{{$customer}}');
  });

  test('caches the convert function across calls (sanity: second call works)', async () => {
    const { runPandocWasm } = await import('./runPandocWasm');
    await runPandocWasm('first.\n');
    const ast = await runPandocWasm('second.\n');
    expect(ast.blocks.length).toBeGreaterThan(0);
  });
});
