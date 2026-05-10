// Public barrel for the docx renderer subpath. Consumers import from
// `markdsl/docx`.
//
// Top-level: blockToDocBuilder + inlinesToRuns are the rendering
// surface; build / buildToBuffer assemble the final Document.
//
// DSL extension points live on DocxRenderConfig — fenced-block
// handlers, `{{...}}` marker emitter, Span class handlers.

export { build, buildToBuffer } from './lib/build';
export type { BuildArgs, DocStyleOpts } from './lib/build';
export { blockToDocBuilder } from './render-blocks';
export { inlinesToRuns } from './render-inlines';
export * from './blocks';
export * from './lib/runs';
export type {
  BodyEntry,
  DocNode,
  RenderCtx,
  DocxRenderConfig,
  FencedDocxHandler,
  MarkerEmitter,
  SpanDocxHandler,
} from './types';
