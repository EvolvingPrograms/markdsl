// Pipeline orchestrator — ties frontmatter + schema + markers + pandoc
// + ast + render together. Consumers configure once with their marker
// registry, AST handlers, and parse callback; then call .process() per
// document.
//
// Three checkpoints exposed so consumers can short-circuit:
//   - resolveMarkers() : up to and including marker substitution
//   - parseToAst()     : up through pandoc parse (good for JSON output)
//   - process()        : the full thing (rendered output)
//
// Each checkpoint returns the intermediate values + everything earlier
// stages produced, so consumers don't have to plumb state themselves.

import { splitFrontMatter } from './frontmatter';
import { mergeValues, schemaDefaults, missingRequired } from './schema/values';
import type { FrontMatter, Schema, Values } from './schema/types';
import type { MarkerRegistry } from './markers/registry';
import { substituteMarkers } from './markers/substitute';
import type { PandocAst } from './pandoc/types';
import { createWalker } from './ast/walker';
import type { AstHandlers, RenderContext } from './ast/types';

// — Configuration —

export interface PipelineConfig<B, I, Ext = undefined> {
  /** Marker registry — the `{{...}}` dispatch table. */
  markers: MarkerRegistry;
  /** AST handlers — block + inline rendering rules. */
  ast: AstHandlers<B, I, Ext>;
  /** Markdown → Pandoc AST. Async-friendly: a `runPandocWasm` engine
   *  returns a Promise. */
  parse: (body: string) => PandocAst | Promise<PandocAst>;
  /** Build the per-render `Ext` state from the front-matter. Called
   *  once at the start of every `process()` / `parseToAst()` call. */
  makeExt?: (meta: FrontMatter) => Ext;
}

export interface ProcessOptions<Ext = undefined> {
  /** Caller-supplied values that override front-matter `values:` and
   *  schema-default values. */
  values?: Values;
  /** Throw if any `required: true` schema fields are missing from the
   *  merged values. */
  strict?: boolean;
  /** Override Ext for this render only. Merged on top of whatever
   *  `makeExt(meta)` produced. */
  ext?: Ext;
}

// — Result types per checkpoint —

export interface ResolveResult {
  meta: FrontMatter;
  values: Values;
  schema: Schema | undefined;
  missing: string[];
  /** Marker-resolved body — valid markdown, ready for pandoc. */
  body: string;
}

export interface ParseResult extends ResolveResult {
  ast: PandocAst;
}

export interface ProcessResult<B, Ext = undefined> extends ParseResult {
  output: B[];
  ext: Ext;
}

export interface Pipeline<B, I, Ext = undefined> {
  /** Up through marker substitution. Useful for `format: 'markdown'`
   *  outputs that want the resolved source verbatim. Synchronous —
   *  no parser involved. */
  resolveMarkers(source: string, opts?: ProcessOptions<Ext>): ResolveResult;
  /** Up through Pandoc parse. Useful for `format: 'json'` outputs that
   *  return the AST directly (e.g., to drive a React renderer). */
  parseToAst(source: string, opts?: ProcessOptions<Ext>): Promise<ParseResult>;
  /** The full thing: parse + walk + render. Returns rendered output
   *  alongside every intermediate. */
  process(source: string, opts?: ProcessOptions<Ext>): Promise<ProcessResult<B, Ext>>;
}

/** Build a pipeline bound to a specific DSL configuration. The
 *  returned object is reusable across documents — `process()` /
 *  `parseToAst()` / `resolveMarkers()` don't mutate the config. */
export function createPipeline<B, I, Ext = undefined>(
  config: PipelineConfig<B, I, Ext>,
): Pipeline<B, I, Ext> {
  const resolveMarkersStage = (
    source: string,
    opts: ProcessOptions<Ext>,
  ): ResolveResult => {
    const { meta, body } = splitFrontMatter(source);
    const schema = (meta as FrontMatter).schema;
    const fmValues = (meta as FrontMatter).values;

    const values = mergeValues(
      schemaDefaults(schema),
      fmValues,
      opts.values,
    );
    const missing = missingRequired(values, schema);

    if (opts.strict && missing.length) {
      throw new Error(
        `markdsl: required schema fields missing: ${missing.join(', ')}`,
      );
    }

    const resolved = substituteMarkers(body, config.markers, { schema, values });

    return { meta, values, schema, missing, body: resolved };
  };

  const parseToAstStage = async (
    source: string,
    opts: ProcessOptions<Ext>,
  ): Promise<ParseResult> => {
    const r = resolveMarkersStage(source, opts);
    const ast = await config.parse(r.body);
    return { ...r, ast };
  };

  return {
    resolveMarkers(source, opts = {} as ProcessOptions<Ext>) {
      return resolveMarkersStage(source, opts);
    },

    async parseToAst(source, opts = {} as ProcessOptions<Ext>) {
      return parseToAstStage(source, opts);
    },

    async process(source, opts = {} as ProcessOptions<Ext>) {
      const r = await parseToAstStage(source, opts);

      const baseExt = config.makeExt
        ? config.makeExt(r.meta)
        : (undefined as unknown as Ext);
      const ext = (opts.ext !== undefined ? opts.ext : baseExt) as Ext;

      const ctx: RenderContext<Ext> = {
        values: r.values,
        schema: r.schema,
        ext,
      };

      const walker = createWalker<B, I, Ext>(config.ast, ctx);
      const output = walker.blocks(r.ast.blocks);

      return { ...r, output, ext };
    },
  };
}
