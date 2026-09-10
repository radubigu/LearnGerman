import { dictionaryGrammar } from './grammar.js';
const API = 'https://api.wiktapi.dev/v1/de';
export const POS = { noun: 'Substantiv', verb: 'Verb', adj: 'Adjektiv', adv: 'Adverb', phrase: 'Wendung', prep: 'Präposition', pron: 'Pronomen', name: 'Eigenname', conj: 'Konjunktion', intj: 'Interjektion', num: 'Numerale', particle: 'Partikel', article: 'Artikel', det: 'Determiner', prefix: 'Präfix', suffix: 'Suffix', proverb: 'Sprichwort', abbrev: 'Abkürzung' };
const list = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value))];
export function wordTypeLabel(parts) {
  return unique(parts).map(pos => POS[pos] ?? pos).join(' / ') || 'Wortart unbekannt';
}
export function nounColor(form, number = 'singular') {
  if (!/^(der|die|das)\s/.test(form)) return '';
  if (number === 'plural') return 'noun-plural';
  return { der: 'noun-masculine', die: 'noun-feminine', das: 'noun-neuter' }[form.split(' ')[0]];
}
function nounForms(entry, number) {
  return unique(list(entry.forms).filter(form =>
    list(form.tags).includes('nominative') && list(form.tags).includes(number) &&
    !list(form.tags).some(tag => ['positive', 'comparative', 'superlative', 'strong', 'weak', 'mixed'].includes(tag)) &&
    ['der', 'die', 'das'].includes(form.article) && typeof form.form === 'string'
  ).map(form => `${form.article} ${form.form}`));
}
function resolvePartOfSpeech(entry, candidates) {
  if (typeof entry.pos === 'string' && entry.pos) return entry.pos;
  // The service omits pos from some detailed entries. Use entry-level evidence,
  // never positional matching between search results and dictionary entries.
  if (nounForms(entry, 'singular').length || nounForms(entry, 'plural').length) return 'noun';
  const tags = list(entry.forms).flatMap(form => list(form.tags));
  if (tags.some(tag => ['strong', 'weak', 'mixed'].includes(tag)) && tags.includes('nominative')) return 'adj';
  const senseTags = list(entry.senses).flatMap(sense => list(sense.tags));
  if ([...tags, ...senseTags].some(tag => ['infinitive', 'indicative', 'imperative', 'subjunctive', 'participle', 'participle-2'].includes(tag))) return 'verb';
  if (list(entry.senses).some(sense => list(sense.form_of).length && list(sense.glosses).some(gloss => typeof gloss === 'string' && /\bdes Verbs\b/u.test(gloss)))) return 'verb';
  const possible = unique(candidates);
  return possible.length === 1 ? possible[0] : '';
}
export const sourceUrl = word => `https://de.wiktionary.org/wiki/${encodeURIComponent(word)}`;
export class DictionaryError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'DictionaryError'; this.status = status; }
}
export function normalizeQuery(input) {
  const query = String(input).trim().normalize('NFC');
  if (!query || query.length > 150) throw new DictionaryError('Bitte 1 bis 150 Zeichen eingeben.');
  return query;
}
function separableCandidate(word) {
  const match = /^([a-zäöüß]+(?:en|ern|eln)) (ab|an|auf|aus|bei|ein|fest|fort|her|heraus|herbei|herunter|herüber|hin|hinein|hinauf|hinaus|hoch|los|mit|nach|nieder|runter|vor|weg|weiter|wieder|zu|zurück|zusammen|über|um)$/u.exec(word);
  return match ? match[2] + match[1] : '';
}
function confirmsSeparatedForm(entry, word) {
  return list(entry.forms).some(form => {
    if (typeof form?.form !== 'string') return false;
    const tags = list(form.tags);
    // Require source evidence for a finite active main-clause form, not just
    // a plausible concatenation or a matching word elsewhere in the glosses.
    return tags.includes('active') && tags.includes('main-clause') && tags.includes('indicative') &&
      form.form.trim().normalize('NFC').replace(/^(?:ich|du|er\/sie\/es|er|sie|es|wir|ihr|Sie)\s+/u, '') === word;
  });
}

export function createDictionary(fetcher = globalThis.fetch) {
  async function request(path, signal) {
    let response;
    try {
      const timeout = AbortSignal.timeout(15000);
      response = await fetcher(`${API}/${path}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new DictionaryError(error.name === 'TimeoutError'
        ? 'Die Wörterbuchanfrage dauert zu lange. Bitte erneut versuchen.'
        : 'Die Wörterbuchantwort konnte nicht geladen werden. Der Suchdienst oder die Browserfreigabe kann die Ursache sein. Bitte erneut versuchen oder im Wiktionary nachsehen.');
    }
    if (!response.ok) throw new DictionaryError(response.status === 404
      ? 'In diesem Wörterbuch nicht gefunden. Bitte Schreibweise oder Grundform prüfen.'
      : response.status === 429 ? 'Zu viele Anfragen. Bitte kurz warten und erneut versuchen.'
        : `Wörterbuch vorübergehend nicht erreichbar (HTTP ${response.status}).`, response.status);
    try { return await response.json(); }
    catch { throw new DictionaryError('Das Wörterbuch hat eine ungültige Antwort geliefert.'); }
  }
  async function lookupWord(word, signal) {
    const query = normalizeQuery(word);
    const data = await request(`word/${encodeURIComponent(query)}?lang=de`, signal);
    if (!Array.isArray(data.entries) || data.entries.some(entry => !entry || typeof entry !== 'object')) {
      throw new DictionaryError('Das Wörterbuch hat keine lesbaren Einträge geliefert.');
    }
    return data.entries;
  }
  async function resolveResult(result, signal) {
    const word = normalizeQuery(result.word);
    if (result.entries) return { ...result, word };
    const candidate = separableCandidate(word);
    if (candidate && (!result.partsOfSpeech?.length || result.partsOfSpeech.includes('verb'))) {
      let entries;
      try { entries = await lookupWord(candidate, signal); }
      catch (error) {
        if (signal?.aborted) throw signal.reason;
        // Missing/blocked candidate lookups still allow the original entry.
        // Do not conceal rate limiting or other explicit server failures.
        if (error.status !== 404 && error.status !== 0) throw error;
      }
      if (signal?.aborted) throw signal.reason;
      const confirmed = list(entries).filter(entry => confirmsSeparatedForm(entry, word));
      if (confirmed.length) return { word: candidate, entries, partsOfSpeech: ['verb'], resolvedFrom: word };
    }
    return { ...result, word, entries: await lookupWord(word, signal) };
  }
  async function searchVariant(input, signal) {
    const query = normalizeQuery(input);
    const [suggestions, exact] = await Promise.allSettled([
      request(`search?${new URLSearchParams({ q: query, lang: 'de' })}`, signal), resolveResult({ word: query }, signal),
    ]);
    if (signal?.aborted) throw signal.reason;
    // A service error must not masquerade as a missing exact word.
    if (exact.status === 'rejected' && exact.reason.status !== 404) throw exact.reason;
    const entries = exact.status === 'fulfilled' ? exact.value.entries : [];
    const resolvedWord = exact.status === 'fulfilled' ? exact.value.word : query;
    if (suggestions.status === 'rejected' && !entries.length) throw suggestions.reason;
    const raw = suggestions.status === 'fulfilled' ? suggestions.value.results : [];
    if (!Array.isArray(raw)) throw new DictionaryError('Das Wörterbuch hat eine ungültige Trefferliste geliefert.');
    const byWord = new Map();
    for (const result of raw) {
      if (result?.lang_code !== 'de' || typeof result.word !== 'string') continue;
      if (!byWord.has(result.word)) byWord.set(result.word, { word: result.word, partsOfSpeech: [] });
      const item = byWord.get(result.word);
      if (result.pos && !item.partsOfSpeech.includes(result.pos)) item.partsOfSpeech.push(result.pos);
    }
    if (entries.length) {
      const item = byWord.get(resolvedWord) ?? { word: resolvedWord, partsOfSpeech: [] };
      item.entries = entries;
      if (exact.value.resolvedFrom) item.resolvedFrom = exact.value.resolvedFrom;
      item.partsOfSpeech = unique([...item.partsOfSpeech, ...(exact.value.partsOfSpeech ?? []), ...mapEntries(resolvedWord, entries, item.partsOfSpeech).map(entry => entry.pos)]);
      byWord.set(resolvedWord, item);
    }
    const rank = word => word === query ? 2 : Number(word.toLocaleLowerCase('de') === query.toLocaleLowerCase('de'));
    return [...byWord.values()].sort((a, b) => rank(b.word) - rank(a.word));
  }
  async function searchWords(input, signal) {
    const query = normalizeQuery(input);
    // Keep genuine lowercase entries (essen) alongside nouns (Essen).
    // Check the noun spelling independently so the prefix-result limit cannot hide it.
    const variants = /^\p{Ll}/u.test(query)
      ? unique([query, query[0].toLocaleUpperCase('de') + query.slice(1)]) : [query];
    const searches = await Promise.allSettled(variants.map(variant => searchVariant(variant, signal)));
    if (signal?.aborted) throw signal.reason;
    const byWord = new Map();
    const errors = [];
    for (const search of searches) {
      if (search.status === 'rejected') { errors.push(search.reason); continue; }
      for (const result of search.value) {
        const previous = byWord.get(result.word);
        byWord.set(result.word, previous ? {
          ...previous, ...result,
          partsOfSpeech: unique([...previous.partsOfSpeech, ...result.partsOfSpeech]),
          entries: result.entries ?? previous.entries,
        } : result);
      }
    }
    if (!byWord.size && errors.length) throw errors[0];
    const rank = word => word === query ? 2 : Number(word.toLocaleLowerCase('de') === query.toLocaleLowerCase('de'));
    const results = [...byWord.values()].sort((a, b) => rank(b.word) - rank(a.word));
    if (errors.length) results.warnings = unique(errors.map(error => error.message));
    return results;
  }
  return { searchWords, lookupWord, resolveResult };
}

export function mapEntries(word, entries, partsOfSpeech = []) {
  return entries.map((entry, index) => {
    const pos = resolvePartOfSpeech(entry, partsOfSpeech);
    return {
      word, entryIndex: index, pos, possiblePartsOfSpeech: pos ? [pos] : unique(partsOfSpeech),
      singular: nounForms(entry, 'singular'), plural: nounForms(entry, 'plural'),
      grammar: dictionaryGrammar(entry, pos), grammarSource: 'dictionary',
      source: sourceUrl(word),
      baseWords: [...new Set(list(entry.senses).flatMap(sense => list(sense.form_of).map(form => form.word)).filter(base => typeof base === 'string' && base !== word))],
      senses: list(entry.senses).map((sense, senseIndex) => ({
        senseIndex: String(sense.sense_index ?? senseIndex + 1),
        definition: list(sense.glosses).filter(gloss => typeof gloss === 'string').join('; '),
        example: list(sense.examples).find(example => typeof example.text === 'string' && !example.ref && example.text.length < 240)?.text ?? '',
      })).filter(sense => sense.definition),
    };
  });
}
