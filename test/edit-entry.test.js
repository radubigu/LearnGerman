import test from 'node:test';
import assert from 'node:assert/strict';
import { editMeaning } from '../web/edit-entry.js';
import { createLibrary, selectionKey, parseEvents, eventRows, LIBRARY_HEADER, validateMeaning } from '../web/library.js';
import { practiceQuestions } from '../web/practice.js';
const noun = { id: 'original', word: 'Bank', entryIndex: 0, senseIndex: '1', definition: 'Eine Sitzgelegenheit.', pos: 'noun', possiblePartsOfSpeech: ['noun'], singular: ['die Bank'], plural: ['die Bänke'], source: 'https://de.wiktionary.org/wiki/Bank', example: '' };
const fields = item => ({ ...item, singular: item.singular.join('; '), plural: item.plural.join('; ') });

test('editing dictionary meanings preserves selection identity, first definition, source, and journal round-trip', () => {
  const library = createLibrary(); library.put(noun);
  const edited = editMeaning(noun, { ...fields(noun), definition: 'Darauf können mehrere Personen sitzen.', example: 'Wir sitzen auf der Bank.' });
  library.put(edited);
  assert.equal(edited.id, noun.id);
  assert.equal(selectionKey(edited), selectionKey(noun));
  assert.equal(edited.originalDefinition, noun.definition);
  assert.equal(edited.source, noun.source);
  assert.equal(library.selected.size, 1);
  const twice = editMeaning(edited, { ...fields(edited), word: 'Sitzbank', singular: 'die Sitzbank', plural: 'die Sitzbänke' });
  assert.equal(selectionKey(twice), selectionKey(noun));
  assert.equal(twice.originalDefinition, noun.definition);
  library.put(twice);
  const reopened = createLibrary(); reopened.accept(parseEvents([LIBRARY_HEADER, ...eventRows([...library.pending.values()])]));
  assert.deepEqual([...reopened.selected.values()], [twice]);
  const imported = createLibrary(); imported.put(JSON.parse(JSON.stringify(twice)));
  assert.equal(selectionKey([...imported.selected.values()][0]), selectionKey(noun));
});

test('manual entry identity and alternative noun forms are preserved; blank forms remain unknown', () => {
  const manual = { ...noun, origin: 'manual' };
  const changed = editMeaning(manual, { ...fields(manual), singular: 'die Bank; die Bank', plural: 'die Bänke; die Banken' });
  assert.equal(selectionKey(changed), selectionKey(manual));
  assert.deepEqual(changed.singular, ['die Bank']);
  assert.deepEqual(changed.plural, ['die Bänke', 'die Banken']);
  assert.deepEqual(editMeaning(manual, { ...fields(manual), singular: '', plural: '' }).plural, []);
  assert.throws(() => editMeaning(manual, { ...fields(manual), plural: 'der Bänke' }), /Plural/);
  assert.throws(() => editMeaning(manual, { ...fields(manual), definition: '' }), /Bedeutung/);
  assert.throws(() => validateMeaning({ ...noun, dictionaryReference: 'invalid' }), /Wörterbuchreferenz/);
});

test('changing part of speech removes stale noun/verb forms and keeps recorded grammar alternatives', () => {
  const verb = editMeaning(noun, { ...fields(noun), word: 'gehen', pos: 'verb', preterite: 'ging', participleII: 'gegangen', auxiliary: 'sein' });
  assert.deepEqual(verb.singular, []); assert.deepEqual(verb.plural, []);
  assert.deepEqual(verb.grammar.preterite, ['ging']);
  const adj = editMeaning(verb, { ...fields(verb), word: 'schnell', pos: 'adj', comparative: 'schneller', superlative: 'am schnellsten' });
  assert.deepEqual(adj.grammar, { comparative: ['schneller'], superlative: ['am schnellsten'] });
});

test('definition edits reset meaning progress only, while example edits preserve existing question keys', async () => {
  const [before] = await practiceQuestions([noun]);
  const [example] = await practiceQuestions([editMeaning(noun, { ...fields(noun), example: 'Ein Beispiel.' })]);
  assert.deepEqual(before.questions.map(q => q.questionKey), example.questions.map(q => q.questionKey));
  const [changed] = await practiceQuestions([editMeaning(noun, { ...fields(noun), definition: 'Eine andere Erklärung.' })]);
  assert.notEqual(before.questions[0].questionKey, changed.questions[0].questionKey);
  assert.deepEqual(before.questions.slice(1).map(q => q.questionKey), changed.questions.slice(1).map(q => q.questionKey));
});
