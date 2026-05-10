// Public barrel for block-level helpers — anything that produces a docx
// `Paragraph` or `Table`. Paragraph primitives (p, h1, h2, list, spacer, raw)
// live under ./paragraphs; tables under their own feature dirs.

export * from './paragraphs';
export * from './field-table';
export * from './grid-table';
export * from './signature-table';
export * from './panel';
