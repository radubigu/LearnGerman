import { POS, normalizeQuery } from './dictionary.js';
import { manualGrammar } from './grammar.js';

export const wiktionarySearchUrl = word => `https://de.wiktionary.org/w/index.php?${new URLSearchParams({ title: 'Spezial:Suche', search: String(word).trim().normalize('NFC') })}`;

export function createManualEntry(values) {
  const word = normalizeQuery(values.word);
  const definition = String(values.definition ?? '').trim();
  const example = String(values.example ?? '').trim();
  if (!definition || definition.length > 5000) throw new Error('Bitte eine Bedeutung mit 1 bis 5000 Zeichen eingeben.');
  if (example.length > 1000) throw new Error('Das Beispiel darf höchstens 1000 Zeichen enthalten.');
  const pos = values.pos ?? '';
  if (pos && !Object.hasOwn(POS, pos)) throw new Error('Bitte eine gültige Wortart auswählen.');
  const source = String(values.source ?? '').trim();
  if (source) {
    let url;
    try { url = new URL(source); } catch { throw new Error('Bitte eine vollständige HTTPS-Quellenadresse eingeben.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Bitte eine HTTPS-Quellenadresse ohne Zugangsdaten eingeben.');
  }
  const singular = [], plural = [];
  if (pos === 'noun') {
    const article = values.article ?? '';
    if (!['', 'der', 'die', 'das', 'plural-only'].includes(article)) throw new Error('Bitte einen gültigen Artikel auswählen.');
    if (['der', 'die', 'das'].includes(article)) singular.push(`${article} ${word}`);
    const pluralWord = String(values.plural ?? '').trim().normalize('NFC').replace(/^die\s+/u, '');
    if (pluralWord.length > 150) throw new Error('Die Pluralform darf höchstens 150 Zeichen enthalten.');
    if (pluralWord) plural.push(`die ${pluralWord}`);
    else if (article === 'plural-only') plural.push(`die ${word}`);
  }
  return { id: crypto.randomUUID(), origin: 'manual', word, pos, possiblePartsOfSpeech: pos ? [pos] : [], singular, plural, grammar: manualGrammar(pos, values), grammarSource: 'manual', definition, example, source, senseIndex: '1' };
}
