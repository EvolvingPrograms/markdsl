// Default markdown format flags for both engines. Centralizing the
// flag string here so the two engines stay in sync — a regression
// where the system engine and the WASM engine disagreed on extension
// flags would be silent and ugly.

/** Markdown extensions enabled / disabled by default. See
 *  ./README.md for the rationale on each flag. */
export const DEFAULT_PANDOC_FROM = [
  'markdown',
  '+fancy_lists',
  '+smart',
  '+bracketed_spans',
  '-tex_math_dollars',
  '-tex_math_single_backslash',
].join('');
