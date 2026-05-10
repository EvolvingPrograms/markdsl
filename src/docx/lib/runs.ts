/**
 * Inline run helpers — return TextRun objects for use inside p().
 * Each helper is intentionally minimal: one property per function.
 */

import { TextRun } from 'docx';

export type RunChild = string | TextRun;

/** Plain text run. */
export const t  = (text: string) => new TextRun({ text });

/** Bold run. */
export const b  = (text: string) => new TextRun({ text, bold: true });

/** Italic run. */
export const i  = (text: string) => new TextRun({ text, italics: true });

/** Bold-italic run. */
export const bi = (text: string) => new TextRun({ text, bold: true, italics: true });

/**
 * Defined-term run: `(<article> *“Term”*)` by default with article `"the"`.
 * Pass `article: false` to drop it (proper nouns), or any string ("a", "an",
 * "such") to override.
 *   dt('Agreement')                       → "(the *“Agreement”*)"
 *   dt('Claude',         { article: false }) → "(*“Claude”*)"
 *   dt("Writer's Share", { article: 'a' })   → "(a *“Writer’s Share”*)"
 */
export const dt = (term: string, opts: { article?: boolean | string } = {}): TextRun[] => {
  let lead: string;
  if (opts.article === false)             lead = '(';
  else if (typeof opts.article === 'string') lead = `(${opts.article} `;
  else                                       lead = '(the ';
  return [t(lead), bi(`“${term}”`), t(')')];
};

/** Coerce a bare string to a TextRun, passing an existing TextRun through unchanged. */
export const asRun = (child: RunChild): TextRun =>
  (typeof child === 'string' ? t(child) : child);
