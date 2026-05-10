// Public barrel for the docx renderer subpath. Consumers import from
// `markdsl/docx`.

export * from './lib';
export * from './blocks';
export * from './render-blocks';
export * from './render-inlines';
export * from './render';
export * from './types';

// Re-export the docx primitives the renderer was built against.
// CRITICAL: Consumers that construct TextRun / Paragraph / Table
// directly (e.g. a custom marker emitter) MUST import them from
// `markdsl/docx`, not from `'docx'` directly. With `file:` deps each
// project gets its own `node_modules/docx`; cross-instance objects
// fail docx's `instanceof` checks during XML serialization and the
// runs serialize as `<rootKey>w:r</rootKey>` instead of `<w:r>...</w:r>`.
export * from 'docx';
