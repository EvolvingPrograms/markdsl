// WASM pandoc engine. Loads the `pandoc-wasm` package on demand and
// runs the Haskell-compiled binary in browser or Node. ~56 MB on disk
// (~15 MB gzipped), so it's an opt-in peer dependency — consumers
// that don't import this module never pay the install cost.
//
// The first call dynamically imports the WASM glue and caches the
// `convert` function. Subsequent calls reuse the loaded instance.
// Async-only because WASM instantiation is async.

import { DEFAULT_PANDOC_FROM } from './flags';
import type { PandocAst } from './types';

// Local typing for the pandoc-wasm `convert` function. The package
// ships no .d.ts; we type only the surface we use here. If pandoc-wasm
// publishes official types, replace this with the imported type.
type ConvertFn = (
  options: { from?: string; to?: string; [k: string]: unknown },
  stdin?: string,
) => Promise<{ stdout: string; stderr: string; warnings: unknown[] }>;

let cachedConvert: ConvertFn | null = null;

async function loadConvert(): Promise<ConvertFn> {
  if (cachedConvert) return cachedConvert;
  try {
    const mod = (await import('pandoc-wasm')) as unknown as { convert: ConvertFn };
    cachedConvert = mod.convert;
    return cachedConvert;
  } catch {
    throw new Error(
      'runPandocWasm: pandoc-wasm is not installed. It is an optional peer ' +
        'dependency — install it explicitly: `bun add pandoc-wasm` / ' +
        '`npm i pandoc-wasm`.',
    );
  }
}

/** Parse a markdown string into a Pandoc JSON AST via the WASM build of
 *  pandoc. Same `PandocAst` shape as `runPandoc`, so the engine can be
 *  swapped freely.
 *
 *  Throws if `pandoc-wasm` isn't installed or the WASM module fails to
 *  load. */
export async function runPandocWasm(body: string): Promise<PandocAst> {
  const convert = await loadConvert();
  const result = await convert({ from: DEFAULT_PANDOC_FROM, to: 'json' }, body);
  return JSON.parse(result.stdout) as PandocAst;
}
