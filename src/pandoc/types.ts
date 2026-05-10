// Pandoc JSON AST types — narrow shapes that match the relevant subset
// of the actual JSON schema. Pandoc's AST is open-ended (every node is
// `{ t: string, c?: unknown }`) so we type the envelope and let
// consumers narrow to specific node shapes at the read site.

/** Top-level Pandoc JSON output. */
export interface PandocAst {
  blocks: PandocBlock[];
  /** Pandoc's API version triple, e.g. [1, 23, 1]. Differs between
   *  pandoc binaries; comparison-tests should normalize this away. */
  'pandoc-api-version'?: number[];
  meta?: unknown;
}

/** A block-level node (Para, Header, OrderedList, CodeBlock, Div, …). */
export interface PandocBlock {
  t: string;
  c?: unknown;
}

/** An inline-level node (Str, Space, Emph, Strong, Link, Span, …). */
export interface PandocInline {
  t: string;
  c?: unknown;
}
