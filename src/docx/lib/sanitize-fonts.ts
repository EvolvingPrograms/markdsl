// Post-process a packed .docx Buffer to rename embedded font zip
// entries to filename-safe sequence numbers (`font1.odttf`,
// `font2.odttf`, …) and rewrite the relationship targets to match.
//
// Why: docx-js writes the embedded font binary at
//   `word/fonts/<family>.odttf`
// where `<family>` is the literal family name passed to FontOptions.
// Word's font loader treats the zip path as opaque bytes; family
// names with spaces or non-ASCII characters round-trip unreliably
// across Word versions and locales (dolanmiu/docx#3019). Sequencing
// the filenames sidesteps the whole class of issues without forking
// docx — the family name in `<w:font w:name="...">` (which is what
// Word uses to resolve the font) stays untouched.

import JSZip from 'jszip';

const FONTS_DIR_RE = /^word\/fonts\/(.+)\.odttf$/;

/** Rewrite font zip entries in a docx Buffer. Idempotent: returns
 *  the input unchanged if there are no font entries to rewrite. */
export async function sanitizeFontFilenames(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);

  const entries: { oldPath: string; oldName: string; data: Uint8Array }[] = [];
  zip.forEach((relPath, file) => {
    const m = relPath.match(FONTS_DIR_RE);
    if (m && !file.dir) entries.push({ oldPath: relPath, oldName: m[1]!, data: new Uint8Array() });
  });
  if (entries.length === 0) return buf;

  // Read each font's bytes BEFORE modifying the tree.
  for (const e of entries) {
    e.data = await zip.file(e.oldPath)!.async('uint8array');
  }

  // Build the rename map (old basename → new basename) and apply it
  // to the zip: remove the old entry, add the renamed one.
  const renames = new Map<string, string>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const newName = `font${i + 1}`;
    renames.set(e.oldName, newName);
    zip.remove(e.oldPath);
    zip.file(`word/fonts/${newName}.odttf`, e.data);
  }

  // Update the fontTable relationships to point at the new filenames.
  // The XML refs use the basename (no `word/fonts/` prefix); replace
  // each `Target="fonts/<old>.odttf"` with the sequential form.
  const relsPath = 'word/_rels/fontTable.xml.rels';
  const rels = zip.file(relsPath);
  if (rels) {
    let xml = await rels.async('text');
    for (const [oldName, newName] of renames) {
      // Escape any regex specials in the old name (spaces, dots, etc.)
      const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      xml = xml.replace(
        new RegExp(`Target="fonts/${escaped}\\.odttf"`, 'g'),
        `Target="fonts/${newName}.odttf"`,
      );
    }
    zip.file(relsPath, xml);
  }

  return zip.generateAsync({ type: 'nodebuffer' }) as Promise<Buffer>;
}
