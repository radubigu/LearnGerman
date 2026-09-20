export function deeplTranslationUrl(definition) {
  const text = String(definition ?? '').trim();
  if (!text) throw new Error('Eine leere Definition kann nicht übersetzt werden.');
  return `https://www.deepl.com/translator#de/en/${encodeURIComponent(text)}`;
}
