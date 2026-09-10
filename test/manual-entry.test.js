import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualEntry, wiktionarySearchUrl } from '../web/manual-entry.js';
import { nounColor } from '../web/dictionary.js';

test('manual noun retains meaning, attribution, full forms and exportable identity', () => {
  const entry = createManualEntry({ word: ' U\u0308bung ', pos: 'noun', article: 'die', plural: 'die Übungen', definition: ' Eine erfundene Erklärung. ', example: ' Ein Beispielsatz. ', source: 'https://de.wiktionary.org/wiki/%C3%9Cbung' });
  assert.equal(entry.word, 'Übung');
  assert.deepEqual(entry.singular, ['die Übung']);
  assert.deepEqual(entry.plural, ['die Übungen']);
  assert.equal(nounColor(entry.singular[0]), 'noun-feminine');
  assert.equal(nounColor(entry.plural[0], 'plural'), 'noun-plural');
  assert.equal(entry.definition, 'Eine erfundene Erklärung.');
  assert.equal(entry.example, 'Ein Beispielsatz.');
  assert.equal(entry.origin, 'manual');
  assert.ok(entry.id);
  assert.deepEqual(JSON.parse(JSON.stringify(entry)), entry);
});

test('manual entries preserve unknown grammar and do not give verbs stale noun forms', () => {
  const unknown = createManualEntry({ word: 'Testwort', definition: 'Erklärung' });
  assert.deepEqual(unknown.possiblePartsOfSpeech, []);
  assert.deepEqual(unknown.singular, []);
  assert.equal(unknown.source, '');
  const verb = createManualEntry({ word: 'üben', pos: 'verb', article: 'die', plural: 'Übungen', definition: 'Erklärung' });
  assert.deepEqual(verb.singular, []);
  assert.deepEqual(verb.plural, []);
  const noun = createManualEntry({ word: 'Testwort', pos: 'noun', article: 'das', definition: 'Erklärung' });
  assert.deepEqual(noun.plural, []);
  const plural = createManualEntry({ word: 'Eltern', pos: 'noun', article: 'plural-only', definition: 'Erklärung' });
  assert.deepEqual(plural.singular, []);
  assert.deepEqual(plural.plural, ['die Eltern']);
});

test('invalid pasted values cannot produce empty meanings or unsafe source links', () => {
  const valid = { word: 'Wort', definition: 'Erklärung' };
  for (const values of [{ word: ' ' }, { definition: ' \n ' }, { definition: 'x'.repeat(5001) }, { pos: 'invented' }, { source: 'javascript:alert(1)' }, { source: 'https://user:secret@example.com/' }, { source: 'not a URL' }]) {
    assert.throws(() => createManualEntry({ ...valid, ...values }));
  }
});

test('Wiktionary search encodes umlauts and query punctuation without changing spelling', () => {
  const url = new URL(wiktionarySearchUrl(' u\u0308bungen & Spaß '));
  assert.equal(url.origin, 'https://de.wiktionary.org');
  assert.equal(url.searchParams.get('search'), 'übungen & Spaß');
  assert.equal(url.searchParams.get('title'), 'Spezial:Suche');
  assert.equal([...url.searchParams].length, 2);
});
