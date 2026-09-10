import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionaryGrammar, manualGrammar } from '../web/grammar.js';
import { mapEntries } from '../web/dictionary.js';
import { createManualEntry } from '../web/manual-entry.js';
import { createLibrary, parseEvents, eventRows, LIBRARY_HEADER, selectionKey, validateMeaning } from '../web/library.js';

test('adjective degrees exclude declined and complete predicative sentences', () => {
  const entry = mapEntries('schnell', [{ pos: 'adj', forms: [
    { form: 'schnell', tags: ['positive'] },
    { form: 'schneller', tags: ['comparative'] },
    { form: 'am schnellsten', tags: ['superlative'] },
    { form: 'schnellerer', tags: ['comparative', 'strong', 'nominative', 'singular'] },
    { form: 'schnellste', article: 'die', tags: ['superlative', 'weak', 'nominative', 'singular'] },
    { form: 'er ist am schnellsten', tags: ['superlative', 'predicative', 'singular'] },
  ] }])[0];
  assert.deepEqual(entry.grammar, { comparative: ['schneller'], superlative: ['am schnellsten'] });
  assert.deepEqual(entry.singular, []);
});

test('irregular alternatives remain separate and missing degrees are not invented', () => {
  assert.deepEqual(dictionaryGrammar({ forms: [
    { form: 'besser', tags: ['comparative'] }, { form: 'besser', tags: ['comparative'] },
    { form: 'am besten', tags: ['superlative'] },
  ] }, 'adj'), { comparative: ['besser'], superlative: ['am besten'] });
  assert.deepEqual(dictionaryGrammar({ forms: [{ form: '—', tags: ['comparative'] }] }, 'adj'), { comparative: [], superlative: [] });
  assert.deepEqual(dictionaryGrammar({ forms: [{ form: 'besser', tags: ['comparative'] }] }, ''), {});
});

test('verb summary forms retain past, participle II and auxiliary with no tense mixing', () => {
  const entry = mapEntries('gehen', [{ forms: [
    { form: 'ging', tags: ['past'], pronouns: ['ich'] },
    { form: 'ich ging', tags: ['past', 'first-person', 'singular', 'active', 'indicative'] },
    { form: 'ich ginge', tags: ['past', 'first-person', 'singular', 'active', 'subjunctive-ii'] },
    { form: 'gingt', tags: ['past'], pronouns: ['ihr'] },
    { form: 'ich wurde gesehen', tags: ['past', 'first-person', 'singular', 'processual-passive', 'indicative'] },
    { form: 'gegangen', tags: ['participle-2', 'perfect'] },
    { form: 'gegangen', tags: ['participle', 'perfect', 'passive'] },
    { form: 'gehend', tags: ['participle', 'present', 'active'] },
    { form: 'sein', tags: ['auxiliary', 'perfect'] },
    { form: 'gegangen sein', tags: ['active', 'infinitive', 'perfect'] },
  ] }])[0];
  assert.equal(entry.pos, 'verb');
  assert.deepEqual(entry.grammar, { preterite: ['ging'], participleII: ['gegangen'], auxiliary: ['sein'] });
});

test('separable verbs and alternative auxiliaries retain their source spelling', () => {
  const grammar = dictionaryGrammar({ forms: [
    { form: 'stand auf', tags: ['past'], pronouns: ['ich'] },
    { form: 'aufgestanden', tags: ['participle-2', 'perfect'] },
    { form: 'sein', tags: ['auxiliary', 'perfect'] },
    { form: 'haben', tags: ['auxiliary', 'perfect'] },
  ] }, 'verb');
  assert.deepEqual(grammar.preterite, ['stand auf']);
  assert.deepEqual(grammar.auxiliary, ['sein', 'haben']);
});

test('grammatical forms stay attached to the appropriate entry and part of speech', () => {
  const entries = mapEntries('begabt', [
    { pos: 'adj', forms: [{ form: 'begabter', tags: ['comparative'] }] },
    { pos: 'verb', senses: [{ glosses: ['Eine Verbform.'] }] },
  ], ['adj', 'verb']);
  assert.deepEqual(entries[0].grammar.comparative, ['begabter']);
  assert.deepEqual(entries[1].grammar, { preterite: [], participleII: [], auxiliary: [] });
});

test('manual grammar ignores stale fields after changing part of speech', () => {
  const values = { word: 'üben', definition: 'Eine erfundene Erklärung.', pos: 'verb', preterite: 'ich übte', participleII: 'geu\u0308bt', auxiliary: 'haben', comparative: 'schneller' };
  const entry = createManualEntry(values);
  assert.deepEqual(entry.grammar, { preterite: ['übte'], participleII: ['geübt'], auxiliary: ['haben'] });
  assert.deepEqual(createManualEntry({ ...values, pos: 'adj', superlative: 'am schnellsten' }).grammar, { comparative: ['schneller'], superlative: ['am schnellsten'] });
  assert.deepEqual(createManualEntry({ ...values, pos: 'noun' }).grammar, {});
});

test('manual alternatives, blank fields and invalid auxiliary names are handled explicitly', () => {
  assert.deepEqual(manualGrammar('verb', { preterite: 'schwamm; schwamm', auxiliary: 'haben; sein' }), { preterite: ['schwamm'], participleII: [], auxiliary: ['haben', 'sein'] });
  assert.throws(() => manualGrammar('verb', { auxiliary: 'werden' }), /haben oder sein/);
  assert.throws(() => manualGrammar('adj', { comparative: 'x'.repeat(201) }), /200 Zeichen/);
});

test('old saved records remain valid, and edited grammar survives journal and export round trips', () => {
  const entry = createManualEntry({ word: 'gehen', definition: 'Eine erfundene Erklärung.', pos: 'verb' });
  delete entry.grammar; delete entry.grammarSource;
  assert.equal(validateMeaning(entry), entry);
  const library = createLibrary(); library.put(entry);
  const original = [...library.pending.values()];
  library.accept(parseEvents([LIBRARY_HEADER, ...eventRows(original)]));
  library.put({ ...entry, grammar: { preterite: ['ging'], participleII: ['gegangen'], auxiliary: ['sein'] }, grammarSource: 'manual' });
  assert.equal(library.selected.size, 1);
  const restored = createLibrary();
  restored.accept(parseEvents([LIBRARY_HEADER, ...eventRows([...original, ...library.pending.values()])]));
  const saved = restored.selected.get(selectionKey(entry));
  assert.equal(saved.id, entry.id);
  assert.deepEqual(JSON.parse(JSON.stringify(saved)).grammar, { preterite: ['ging'], participleII: ['gegangen'], auxiliary: ['sein'] });
  assert.equal(saved.grammarSource, 'manual');
});

test('invalid grammar in an imported record is rejected without changing historical payloads', () => {
  const entry = createManualEntry({ word: 'gehen', definition: 'Erklärung', pos: 'verb' });
  assert.throws(() => validateMeaning({ ...entry, grammar: { preterite: 'ging' } }), /Wortformen/);
  assert.throws(() => validateMeaning({ ...entry, grammar: { comparative: ['besser'] } }), /Wortformen/);
  assert.throws(() => validateMeaning({ ...entry, grammarSource: 'invented' }), /Herkunft/);
});
