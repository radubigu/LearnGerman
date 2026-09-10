const list = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values)];
const agreement = ['strong', 'weak', 'mixed', 'nominative', 'accusative', 'dative', 'genitive', 'singular', 'plural', 'masculine', 'feminine', 'neuter'];
export const GRAMMAR_FIELDS = {
  adj: [['comparative', 'Komparativ', 'z. B. schneller'], ['superlative', 'Superlativ', 'z. B. am schnellsten']],
  verb: [['preterite', 'Präteritum / Imperfekt (ich)', 'z. B. ging'], ['participleII', 'Partizip II', 'z. B. gegangen'], ['auxiliary', 'Perfekt-Hilfsverb', 'haben; sein']],
};
export function dictionaryGrammar(entry, pos) {
  const forms = list(entry.forms).filter(form => form && typeof form.form === 'string' && form.form.trim() && !/^(?:—|–|-|\?)$/u.test(form.form.trim()));
  const matches = predicate => unique(forms.filter(form => predicate(list(form.tags), form)).map(form => form.form.trim().normalize('NFC')));
  if (pos === 'adj') {
    const degree = tag => matches(tags => tags.includes(tag) && !tags.some(value => agreement.includes(value) || value === 'predicative'));
    return { comparative: degree('comparative'), superlative: degree('superlative') };
  }
  if (pos === 'verb') {
    const preterite = matches((tags, form) => tags.includes('past') &&
      !tags.some(tag => ['perfect', 'pluperfect', 'present', 'future', 'infinitive', 'participle', 'participle-2', 'plural', 'imperative', 'subordinate-clause'].includes(tag) || tag.includes('passive') || tag.startsWith('subjunctive')) &&
      (list(form.pronouns).includes('ich') || (tags.includes('first-person') && tags.includes('singular') && tags.includes('indicative') && tags.includes('active'))));
    return {
      preterite: unique(preterite.map(form => form.replace(/^ich\s+/u, ''))),
      participleII: matches(tags => (tags.includes('participle-2') || (tags.includes('participle') && tags.includes('perfect'))) &&
        !tags.some(tag => agreement.includes(tag) || ['present', 'infinitive', 'gerundive'].includes(tag))),
      auxiliary: matches(tags => tags.includes('auxiliary') && tags.includes('perfect')).filter(form => ['haben', 'sein'].includes(form)),
    };
  }
  return {};
}
export function validateGrammar(grammar, pos) {
  // Old saved meanings have no grammar property; keep them readable unchanged.
  if (grammar === undefined) return;
  if (!grammar || typeof grammar !== 'object' || Array.isArray(grammar)) throw new Error('Ungültige Grammatikangaben.');
  const fields = (GRAMMAR_FIELDS[pos] ?? []).map(([key]) => key);
  for (const [key, values] of Object.entries(grammar)) {
    if (!fields.includes(key) || !Array.isArray(values) || values.length > 20 || values.some(value => typeof value !== 'string' || !value.trim() || value.length > 200)) throw new Error('Ungültige Wortformen. Bitte höchstens 20 Formen mit je 200 Zeichen angeben.');
    if (key === 'auxiliary' && values.some(value => !['haben', 'sein'].includes(value))) throw new Error('Als Perfekt-Hilfsverb bitte haben oder sein angeben.');
  }
}
export function manualGrammar(pos, values) {
  const grammar = {};
  for (const [key] of GRAMMAR_FIELDS[pos] ?? []) {
    grammar[key] = unique(String(values[key] ?? '').normalize('NFC').split(/[;\n]/u).map(value => value.trim()).filter(Boolean));
    if (key === 'preterite') grammar[key] = unique(grammar[key].map(value => value.replace(/^ich\s+/u, '')));
  }
  validateGrammar(grammar, pos);
  return grammar;
}
