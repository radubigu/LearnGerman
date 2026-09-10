import { validateMeaning } from './library.js';
import { POS, normalizeQuery } from './dictionary.js';
import { manualGrammar } from './grammar.js';

export function editMeaning(entry, values) {
  validateMeaning(entry);
  const word = normalizeQuery(values.word);
  const definition = String(values.definition ?? '').trim();
  const example = String(values.example ?? '').trim();
  const pos = values.pos ?? '';
  if (!definition || definition.length > 5000) throw new Error('Bitte eine Bedeutung mit 1 bis 5000 Zeichen eingeben.');
  if (example.length > 1000) throw new Error('Das Beispiel darf höchstens 1000 Zeichen enthalten.');
  if (pos && !Object.hasOwn(POS, pos)) throw new Error('Bitte eine gültige Wortart auswählen.');
  const forms = (value, number) => {
    const result = [...new Set(String(value ?? '').split(';').map(text => text.trim().normalize('NFC').replace(/\s+/gu, ' ')).filter(Boolean))];
    if (result.some(form => form.length > 200 || !(number === 'singular' ? /^(der|die|das)\s+\S/u : /^die\s+\S/u).test(form))) throw new Error(number === 'singular' ? 'Singular bitte vollständig mit der, die oder das eingeben; Alternativen mit ; trennen.' : 'Plural bitte vollständig mit die eingeben; Alternativen mit ; trennen.');
    return result;
  };
  const updated = { ...structuredClone(entry), word, definition, example, pos,
    possiblePartsOfSpeech: pos ? [pos] : entry.pos === pos ? entry.possiblePartsOfSpeech : [],
    singular: pos === 'noun' ? forms(values.singular, 'singular') : [],
    plural: pos === 'noun' ? forms(values.plural, 'plural') : [],
    grammar: manualGrammar(pos, values), grammarSource: 'manual', edited: true,
    originalDefinition: entry.originalDefinition ?? entry.definition };
  if (entry.origin !== 'manual') updated.dictionaryReference = entry.dictionaryReference ?? {
    word: entry.word, entryIndex: entry.entryIndex, senseIndex: entry.senseIndex, definition: entry.definition,
  };
  return validateMeaning(updated);
}
