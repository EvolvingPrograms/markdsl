// Top-level orchestrator: markdown source string → docx Buffer (or file).
// Generic — every DSL-specific bit (fenced handlers, marker emission,
// span dispatch, title interpolation) arrives via `DocxRenderConfig`.
//
// Pipeline:
//   1. Split front-matter (markdsl).
//   2. Merge values: caller > frontmatter > schema-default.
//   3. Optionally enforce schema-required fields (strict).
//   4. Pre-process collapsed Div fences `::: {.x} :::` into the
//      two-line form pandoc requires.
//   5. Parse markdown → Pandoc AST (system pandoc by default; pass
//      `runPandocWasm` for browser/no-system-pandoc).
//   6. Walk top-level blocks: anything inside `::: {.header}` lands
//      in the header section (full-width, single-column even when
//      the body is multi-column); everything else lands in the body.
//   7. Resolve title via `config.resolveText` (identity by default).
//   8. Assemble via `build`/`buildToBuffer`.

import { splitFrontMatter } from '../frontmatter';
import {
  mergeValues,
  schemaDefaults,
  missingRequired,
  type Schema,
  type Values,
} from '../schema';
import { runPandoc } from '../pandoc';
import type { PandocAst, PandocBlock } from '../pandoc';

import { build, buildToBuffer } from './lib/build';
import { blockToDocBuilder } from './render-blocks';
import type {
  BodyEntry,
  DocStyle,
  DocxFrontMatter,
  DocxRenderConfig,
  RenderCtx,
} from './types';

/** Markdown parser hook. Default: system `pandoc` binary (Node only).
 *  Pass `runPandocWasm` from `markdsl/pandoc` for browser / no-system-
 *  pandoc use. */
export type ParseFn = (body: string) => PandocAst | Promise<PandocAst>;

async function defaultParse(body: string): Promise<PandocAst> {
  return runPandoc(body);
}

/** Inputs to the docx renderer. All optional except `srcText`. */
export interface RenderMarkdownOptions {
  /** DSL extension points: fenced handlers, marker emitter, span
   *  handlers, text-level interpolation. */
  config?: DocxRenderConfig;
  /** Markdown parser. Defaults to system pandoc. */
  parse?: ParseFn;
  /** Caller-supplied values that override front-matter and schema defaults. */
  values?: Values;
  /** Throw if any schema-required keys are unset after merging. */
  strict?: boolean;
  /** Override the front-matter title. */
  title?: string;
  /** Working directory for relative file resolution. Defaults to
   *  `process.cwd()` in Node, '/' in the browser. */
  baseDir?: string;
}

/** Internal: source string → ready-to-render body + header + style.
 *  Shared by every output entry point. */
async function srcToDocBody(srcText: string, opts: RenderMarkdownOptions) {
  const { meta, body } = splitFrontMatter<DocxFrontMatter>(srcText);
  const schema = meta.schema as Schema | undefined;

  const values = mergeValues(
    schemaDefaults(schema),
    meta.values as Values | undefined,
    opts.values,
  );

  if (opts.strict) {
    const missing = missingRequired(values, schema);
    if (missing.length) {
      throw new Error(`Missing required values: ${missing.join(', ')}`);
    }
  }

  // Pre-process: expand collapsed empty Div fences `::: {.class} :::` into
  // the two-line form pandoc requires. Linters that auto-format markdown
  // often pull short fences onto one line; this keeps `::: {.gap} :::`
  // etc. working as expected.
  const preprocessed = body.replace(
    /^(\s*):::\s*(\{[^}]+\})\s+:::\s*$/gm,
    '$1::: $2\n$1:::',
  );
  const parse = opts.parse ?? defaultParse;
  const ast = await parse(preprocessed);
  const style = (meta.style ?? {}) as DocStyle;
  const ctx: RenderCtx = {
    baseDir: opts.baseDir ?? (typeof process !== 'undefined' ? process.cwd() : '/'),
    schema,
    indent: meta.indent === true,
    bodyIndent: style.body?.indent,
    gap: style.gap,
    paraSpacing: style.spacing,
    font: style.font,
  };
  const config = opts.config ?? {};

  // Split top-level blocks into header (rendered in section 1, spans
  // page width) and body (section 2, can be multi-column). Any
  // `::: {.header}` Div at the top level extracts its children into
  // the header block list.
  const headerBody: BodyEntry[] = [];
  const docBody: BodyEntry[] = [];
  for (const blk of ast.blocks) {
    if (blk.t === 'Div') {
      const [attrs, children] = blk.c as [[string, string[], unknown[]], unknown[]];
      const classes = attrs[1] ?? [];
      if (classes.includes('header')) {
        for (const child of children) {
          headerBody.push(...blockToDocBuilder(child as PandocBlock, values, ctx, config));
        }
        continue;
      }
    }
    docBody.push(...blockToDocBuilder(blk, values, ctx, config));
  }

  const rawTitle = opts.title ?? meta.title;
  const title = rawTitle && config.resolveText
    ? config.resolveText(rawTitle, { schema, values })
    : rawTitle;

  return {
    title,
    body: docBody,
    headerBody: headerBody.length ? headerBody : undefined,
    style,
    output: meta.output,
  };
}

/** Markdown → .docx Buffer in memory. No filesystem access. */
export async function renderMarkdownToBuffer(
  srcText: string,
  opts: RenderMarkdownOptions = {},
): Promise<Buffer> {
  const { title, body, headerBody, style } = await srcToDocBody(srcText, opts);
  return buildToBuffer({ title, body, headerBody, style });
}

/** Markdown → .docx file on disk. Resolves to the written path. */
export async function renderMarkdownToFile(
  srcText: string,
  output: string,
  opts: RenderMarkdownOptions = {},
): Promise<string> {
  const { title, body, headerBody, style } = await srcToDocBody(srcText, opts);
  return build({ title, output, body, headerBody, style });
}

/** Markdown → either a Buffer (no `output`) or a file path (with
 *  `output`). The output path can come from `opts.output` or the
 *  front-matter `output:` field. */
export async function renderMarkdown(
  srcText: string,
  opts: RenderMarkdownOptions & { output?: string } = {},
): Promise<Buffer | string> {
  const { title, body, headerBody, style, output: metaOutput } = await srcToDocBody(srcText, opts);
  const output = opts.output ?? metaOutput;
  if (output) return build({ title, output, body, headerBody, style });
  return buildToBuffer({ title, body, headerBody, style });
}

// Re-exported so the orchestrator path is `import { renderMarkdownToBuffer, srcToDocBody } from 'markdsl/docx'`.
export { srcToDocBody };
