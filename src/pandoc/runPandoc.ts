// System pandoc engine. Shells out to the `pandoc` binary on $PATH
// via execSync. Synchronous on purpose — pandoc invocations are short
// (tens of milliseconds on a typical document) and the calling code
// almost always wants the result before continuing.
//
// Node-only by virtue of the child_process import. Browser consumers
// use runPandocWasm instead.

import { execSync } from 'node:child_process';
import { DEFAULT_PANDOC_FROM } from './flags';
import type { PandocAst } from './types';

/** Parse a markdown string into a Pandoc JSON AST by shelling out to
 *  the system `pandoc` binary. The body is passed via stdin so we
 *  don't need a temporary file.
 *
 *  Throws if pandoc isn't on $PATH or returns a non-zero exit code. */
export function runPandoc(body: string): PandocAst {
  const out = execSync(
    `pandoc --from=${DEFAULT_PANDOC_FROM} -t json`,
    { input: body, encoding: 'utf8' },
  );
  return JSON.parse(out) as PandocAst;
}
