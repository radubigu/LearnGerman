import test from 'node:test';
import assert from 'node:assert/strict';
import { createDictionary, mapEntries, normalizeQuery, nounColor, wordTypeLabel } from '../web/dictionary.js';

const response = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
test('exact words survive the limited prefix suggestions and keep distinct parts of speech', async () => {
  const dictionary = createDictionary(async url => url.includes('/search?') ? response({ results: [
    { word: 'begabt', lang_code: 'de', pos: 'adj' }, { word: 'begabt', lang_code: 'de', pos: 'verb' },
    { word: 'between', lang_code: 'en' },
  ] }) : url.includes('/word/zwischen?') ? response({ entries: [{ senses: [{ glosses: ['zwischen zwei Dingen'] }] }] }) : response({}, 404));
  const found = await dictionary.searchWords('zwischen');
  assert.equal(found[0].word, 'zwischen');
  assert.deepEqual(found[1].partsOfSpeech, ['adj', 'verb']);
  assert.equal(found.length, 2);
});
test('service failure is not reported as a missing exact word', async () => {
  const dictionary = createDictionary(async url => url.includes('/search?') ? response({ results: [] }) : response({}, 503));
  await assert.rejects(dictionary.searchWords('Buch'), error => error.status === 503);
});
test('404 can still return suggestions and exact lookup works if suggestions fail', async () => {
  const missing = createDictionary(async url => url.includes('/search?') ? response({ results: [{ word: 'Buch', lang_code: 'de', pos: 'noun' }] }) : response({}, 404));
  assert.equal((await missing.searchWords('Buc'))[0].word, 'Buch');
  const exact = createDictionary(async url => url.includes('/search?') ? response({}, 500) : response({ entries: [{}] }));
  assert.equal((await exact.searchWords('Buch'))[0].entries.length, 1);
});
test('encoded words use NFC and errors remain explicit', async () => {
  let requested;
  const dictionary = createDictionary(async url => { requested = url; return response({}, 404); });
  await assert.rejects(dictionary.lookupWord('Bu\u0308cher'), error => error.status === 404);
  assert.match(requested, /B%C3%BCcher/);
  assert.throws(() => normalizeQuery(' '));
});
test('separate noun entries retain different plurals', () => {
  const entry = plural => ({ forms: [
    { article: 'die', form: 'Bank', tags: ['nominative', 'singular'] },
    { article: 'die', form: plural, tags: ['nominative', 'plural'] },
    { article: 'der', form: 'Bank', tags: ['dative', 'singular'] },
  ], senses: [{ glosses: ['Eine Testbedeutung.'] }] });
  const result = mapEntries('Bank', [entry('Bänke'), entry('Banken')]);
  assert.deepEqual(result[0].singular, ['die Bank']);
  assert.deepEqual(result[0].plural, ['die Bänke']);
  assert.deepEqual(result[1].plural, ['die Banken']);
});
test('adjective agreement does not create a noun article; missing arrays are tolerated', () => {
  const result = mapEntries('begabt', [{ forms: [
    { article: 'der', form: 'begabte', tags: ['nominative', 'singular', 'weak'] },
  ] }]);
  assert.deepEqual(result[0].singular, []);
  assert.deepEqual(result[0].senses, []);
});
test('examples avoid quoted excerpts and base forms are preserved', () => {
  const result = mapEntries('ging', [{ senses: [{ glosses: ['Test'], form_of: [{ word: 'gehen' }], examples: [
    { text: 'A quoted text', ref: 'Some book' }, { text: 'Ich ging nach Hause.' },
  ] }] }]);
  assert.equal(result[0].senses[0].example, 'Ich ging nach Hause.');
  assert.deepEqual(result[0].baseWords, ['gehen']);
});
test('malformed successful responses fail visibly', async () => {
  const dictionary = createDictionary(async () => response({ entries: 'wrong' }));
  await assert.rejects(dictionary.lookupWord('Buch'), /lesbaren Einträge/);
});

test('feminine singular and plural die have different colors', () => {
  assert.equal(nounColor('der Tisch'), 'noun-masculine');
  assert.equal(nounColor('die Bank'), 'noun-feminine');
  assert.equal(nounColor('das Buch'), 'noun-neuter');
  assert.equal(nounColor('die Bänke', 'plural'), 'noun-plural');
  assert.equal(nounColor('die Eltern', 'plural'), 'noun-plural');
  assert.equal(nounColor('Buch'), '');
});
test('missing detailed types use grammatical evidence without mixing ambiguous entries', () => {
  const entries = mapEntries('begabt', [
    { forms: [{ form: 'begabter', tags: ['nominative', 'singular', 'strong'] }] },
    { senses: [{ form_of: [{ word: 'begaben' }], glosses: ['Partizip Perfekt des Verbs begaben'] }] },
    { senses: [{ tags: ['imperative', 'plural'], glosses: ['Eine Verbform.'] }] },
    { senses: [{ glosses: ['Keine sichere Wortart.'] }] },
  ], ['adj', 'verb']);
  assert.deepEqual(entries.map(entry => entry.pos), ['adj', 'verb', 'verb', '']);
  assert.deepEqual(entries[3].possiblePartsOfSpeech, ['adj', 'verb']);
  assert.deepEqual(entries[0].singular, []);
  assert.equal(mapEntries('zwischen', [{}], ['prep'])[0].pos, 'prep');
  assert.equal(wordTypeLabel(['adj', 'verb']), 'Adjektiv / Verb');
});
test('noun evidence supplies a type when the exact match is absent from prefix search', async () => {
  const dictionary = createDictionary(async url => url.includes('/search?') ? response({ results: [] }) : response({ entries: [{
    forms: [{ article: 'das', form: 'Buch', tags: ['nominative', 'singular'] }],
  }] }));
  const result = (await dictionary.searchWords('Buch'))[0];
  assert.deepEqual(result.partsOfSpeech, ['noun']);
  assert.equal(mapEntries(result.word, result.entries, result.partsOfSpeech)[0].pos, 'noun');
});
test('explicit entry type takes precedence over ambiguous search metadata', () => {
  const entry = mapEntries('Laut', [{ pos: 'noun' }], ['adj', 'noun'])[0];
  assert.equal(entry.pos, 'noun');
  assert.deepEqual(entry.possiblePartsOfSpeech, ['noun']);
});

test('lowercase nouns resolve even if neither prefix list contains the exact spelling', async () => {
  const dictionary = createDictionary(async url => {
    if (url.includes('/search?')) return response({ results: [{ word: 'Buchhandlung', lang_code: 'de', pos: 'noun' }] });
    return url.includes('/word/Buch?') ? response({ entries: [{ pos: 'noun', forms: [{ article: 'das', form: 'Buch', tags: ['nominative', 'singular'] }] }] }) : response({}, 404);
  });
  const results = await dictionary.searchWords(' buch ');
  assert.equal(results[0].word, 'Buch');
  assert.ok(results[0].entries);
  assert.equal(results.filter(item => item.word === 'Buchhandlung').length, 1);
  assert.equal(mapEntries(results[0].word, results[0].entries)[0].source, 'https://de.wiktionary.org/wiki/Buch');
});
test('a lowercase verb keeps priority while its capitalized noun is also available', async () => {
  const dictionary = createDictionary(async url => {
    if (url.includes('/search?')) return response({ results: [] });
    return response({ entries: [{ pos: url.includes('/word/essen?') ? 'verb' : 'noun' }] });
  });
  const results = await dictionary.searchWords('essen');
  assert.deepEqual(results.map(item => item.word), ['essen', 'Essen']);
  assert.deepEqual(results.map(item => item.partsOfSpeech), [['verb'], ['noun']]);
});
test('capitalized prefix search finds noun suggestions and a true missing word stays missing', async () => {
  const dictionary = createDictionary(async url => {
    if (url.includes('/search?')) return response({ results: new URL(url).searchParams.get('q') === 'Entschei'
      ? [{ word: 'Entscheidung', lang_code: 'de', pos: 'noun' }] : [] });
    return response({}, 404);
  });
  assert.equal((await dictionary.searchWords('entschei'))[0].word, 'Entscheidung');
  assert.equal((await dictionary.searchWords('zzzxxyy')).length, 0);
});
test('failure of one casing preserves valid results and reports the incomplete search', async () => {
  const dictionary = createDictionary(async url => {
    if (url.includes('/search?')) return response({ results: [] });
    return url.includes('/word/essen?') ? response({ entries: [{ pos: 'verb' }] }) : response({}, 503);
  });
  const results = await dictionary.searchWords('essen');
  assert.equal(results[0].word, 'essen');
  assert.match(results.warnings[0], /503/);
});

const abholenEntry = { forms: [
  { form: 'wir holen ab', tags: ['first-person', 'plural', 'present', 'active', 'main-clause', 'indicative'] },
  { form: 'holte ab', tags: ['past'], pronouns: ['ich'] },
  { form: 'ich abholte', tags: ['past', 'active', 'first-person', 'singular', 'indicative', 'subordinate-clause'] },
  { form: 'abgeholt', tags: ['participle-2', 'perfect'] },
  { form: 'haben', tags: ['auxiliary', 'perfect'] },
], senses: [{ glosses: ['Eine erfundene Testbedeutung.'] }] };

test('a separated verb suggestion opens its evidenced base without requesting the broken space URL', async () => {
  const calls = [];
  const dictionary = createDictionary(async url => {
    calls.push(url);
    if (url.includes('/word/abholen?')) return response({ entries: [abholenEntry] });
    throw new TypeError('Blocked response');
  });
  const result = await dictionary.resolveResult({ word: 'holen ab', partsOfSpeech: ['verb'] });
  assert.equal(result.word, 'abholen');
  assert.equal(result.resolvedFrom, 'holen ab');
  assert.equal(calls.length, 1);
  const entry = mapEntries(result.word, result.entries, result.partsOfSpeech)[0];
  assert.equal(entry.source, 'https://de.wiktionary.org/wiki/abholen');
  assert.deepEqual(entry.grammar.preterite, ['holte ab']);
  assert.deepEqual(entry.grammar.participleII, ['abgeholt']);
});

test('typing a separated infinitive also discovers the canonical entry', async () => {
  const dictionary = createDictionary(async url => {
    if (url.includes('/search?')) return response({ results: [] });
    if (url.includes('/word/abholen?')) return response({ entries: [abholenEntry] });
    return response({}, 404);
  });
  const result = (await dictionary.searchWords('holen ab')).find(item => item.entries);
  assert.equal(result.word, 'abholen');
  assert.equal(result.resolvedFrom, 'holen ab');
});

test('a plausible joined spelling alone does not justify replacing a phrase', async () => {
  const calls = [];
  const dictionary = createDictionary(async url => {
    calls.push(url);
    return response({ entries: [{ pos: 'verb', senses: [{ glosses: ['Unrelated entry.'] }] }] });
  });
  const result = await dictionary.resolveResult({ word: 'holen ab', partsOfSpeech: ['verb'] });
  assert.equal(result.word, 'holen ab');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes('holen%20ab'));
  calls.length = 0;
  await dictionary.resolveResult({ word: 'sich freuen', partsOfSpeech: ['verb'] });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('sich%20freuen'));
});

test('ordinary holen stays distinct and cached exact results do not trigger new requests', async () => {
  let calls = 0;
  const dictionary = createDictionary(async () => { calls++; return response({ entries: [{}] }); });
  assert.equal((await dictionary.resolveResult({ word: 'holen' })).word, 'holen');
  assert.equal(calls, 1);
  await dictionary.resolveResult({ word: 'holen', entries: [{}] });
  assert.equal(calls, 1);
});

test('separable lookup respects cancellation and rate limits, and browser errors avoid blaming connectivity', async () => {
  const controller = new AbortController();
  const cancelled = createDictionary(async () => { controller.abort(); return response({ entries: [abholenEntry] }); });
  await assert.rejects(cancelled.resolveResult({ word: 'holen ab' }, controller.signal), error => error.name === 'AbortError');
  const limited = createDictionary(async () => response({}, 429));
  await assert.rejects(limited.resolveResult({ word: 'holen ab' }), error => error.status === 429);
  const blocked = createDictionary(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(blocked.lookupWord('Übung'), /Browserfreigabe/);
});
