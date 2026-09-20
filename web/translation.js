export function deeplTranslationUrl(definition) {
  const text = String(definition ?? '').trim();
  if (!text) throw new Error('Eine leere Definition kann nicht übersetzt werden.');
  // DeepL uses slashes as separators in this fragment route, even when an
  // ASCII slash was percent-encoded. A full-width slash preserves the visible
  // punctuation while keeping the complete definition in one route segment.
  const routeSafeText = text.replaceAll('/', '／');
  return `https://www.deepl.com/translator#de/en/${encodeURIComponent(routeSafeText)}`;
}
