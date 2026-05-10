// Split a markdown source into its YAML front-matter and the body that
// follows. Both halves are returned verbatim so downstream stages can run
// on plain strings without any framework awareness.
//
// Front-matter contract:
//   1. The source MUST start with `---` on the first line (allowing only a
//      UTF-8 BOM and CRLF line endings before).
//   2. A second `---` line ends the front-matter block.
//   3. Everything between is parsed as YAML; everything after is the body.
//   4. If no leading `---` is present, the whole source is the body and
//      `meta` is `{}`.
//
// Why a small dedicated module: front-matter splitting is shared by every
// DSL consumer and has no dependency on the marker grammar, schema, or AST
// rendering. Lifting it lets the rest of the pipeline operate on
// `{ meta, body }` without re-implementing the boundary detection.

import yaml from 'js-yaml';

export interface SplitResult<Meta = Record<string, unknown>> {
  /** Parsed YAML front-matter, or `{}` if none was present. */
  meta: Meta;
  /** The body markdown — everything after the closing `---`, or the
   *  whole source if no front-matter was present. Trailing newlines are
   *  preserved so line-number-sensitive parsers (pandoc) get the same
   *  source they would get if you read the file directly. */
  body: string;
}

const BOM = '﻿';

/** Split a markdown source into front-matter + body.
 *
 *  Generic over `Meta` so callers can supply their own typed front-matter
 *  shape; default is `Record<string, unknown>`. */
export function splitFrontMatter<Meta = Record<string, unknown>>(
  source: string,
): SplitResult<Meta> {
  // Strip BOM if present — common from Windows editors and rare legitimate
  // sources, but we don't want it to defeat the leading-`---` check.
  const src = source.startsWith(BOM) ? source.slice(BOM.length) : source;

  // Front-matter only kicks in when the source LITERALLY starts with `---`
  // followed by a newline. Anything else (even a leading blank line) means
  // there is no front-matter and the whole source is the body.
  if (!src.startsWith('---\n') && !src.startsWith('---\r\n')) {
    return { meta: {} as Meta, body: source };
  }

  // Find the closing fence on its own line. We scan line-by-line rather
  // than regex-matching so a literal `---` inside a YAML string can't
  // close the block — the closing fence must be at column 0.
  const lines = src.split('\n');
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').replace(/\r$/, '');
    if (line === '---' || line === '...') {
      closeIdx = i;
      break;
    }
  }

  // Unterminated front-matter is a hard error — silently treating it as
  // body would mask author mistakes (the YAML keys would render as
  // markdown text). Fail loudly.
  if (closeIdx === -1) {
    throw new Error(
      'splitFrontMatter: front-matter opened with `---` was not closed. ' +
        'Add a closing `---` (or `...`) on its own line.',
    );
  }

  const yamlText = lines.slice(1, closeIdx).join('\n');
  // Body starts on the line AFTER the closing fence. Re-join with `\n`
  // (we already split on `\n`) — CRLF in the source is preserved on the
  // body lines themselves via the `\r` we left intact.
  const body = lines.slice(closeIdx + 1).join('\n');

  // Empty front-matter (`---\n---\n`) is valid; yaml.load returns `null`,
  // which we coerce to `{}` for caller ergonomics.
  const meta = (yaml.load(yamlText) ?? {}) as Meta;

  // Front-matter must be a YAML mapping at the top level. Sequences and
  // scalars at the root are technically valid YAML but never what the
  // author meant in a markdown front-matter context — fail loudly.
  if (typeof meta !== 'object' || Array.isArray(meta)) {
    throw new Error(
      'splitFrontMatter: front-matter must parse to a YAML mapping (object). ' +
        `Got ${Array.isArray(meta) ? 'array' : typeof meta}.`,
    );
  }

  return { meta, body };
}
