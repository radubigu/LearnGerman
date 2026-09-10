import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary, parseEvents, eventRows, LIBRARY_HEADER, selectionKey, parseSheetId, validateMeaning } from '../web/library.js';
const meaning = (id, word = 'Buch') => ({ id, word, entryIndex: 0, senseIndex: '1', definition: 'Eine erfundene Erklärung.', pos: 'noun', possiblePartsOfSpeech: ['noun'], singular: ['das Buch'], plural: ['die Bücher'], source: 'https://de.wiktionary.org/wiki/Buch', example: '' });
const read = (...events) => parseEvents([LIBRARY_HEADER, ...eventRows(events.flat())]);

test('two devices preserve unrelated additions and deletions, and a reload restores full grammar', () => {
  const a = createLibrary(), b = createLibrary();
  a.put(meaning('a')); const initial = [...a.pending.values()];
  a.accept(read(initial)); b.accept(read(initial));
  a.remove(selectionKey(meaning('a'))); b.put(meaning('b', 'Haus'));
  const remote = read(initial, [...b.pending.values()], [...a.pending.values()]);
  a.accept(remote); b.accept(remote);
  assert.deepEqual([...a.selected.values()], [...b.selected.values()]);
  assert.equal(a.selected.size, 1);
  assert.equal([...a.selected.values()][0].word, 'Haus');
  const fresh = createLibrary(); fresh.accept(remote);
  assert.deepEqual([...fresh.selected.values()][0].plural, ['die Bücher']);
  assert.equal(a.pending.size, 0);
});

test('duplicates from uncertain saves do not resurrect a later deletion', () => {
  const library = createLibrary(); library.put(meaning('a'));
  const add = [...library.pending.values()][0];
  library.accept(read(add)); library.remove(add.key);
  const remove = [...library.pending.values()][0];
  library.accept(read(add, remove, add));
  assert.equal(library.selected.size, 0);
  assert.equal(library.pending.size, 0);
});

test('changes made during save and unsaved drafts survive incoming data', () => {
  const library = createLibrary(); library.put(meaning('a'));
  const saving = [...library.pending.values()];
  library.put(meaning('b', 'Haus'));
  library.accept(read(saving));
  assert.equal(library.pending.size, 1);
  assert.equal(library.selected.size, 2);
  library.accept(read());
  assert.equal(library.selected.size, 1);
  assert.equal([...library.selected.values()][0].word, 'Haus');
});

test('corrupt schemas, mismatched identities and unsafe source URLs fail before loading', () => {
  assert.throws(() => parseEvents([['wrong schema']]));
  assert.throws(() => parseEvents([LIBRARY_HEADER, ['id', 'put', 'key', '{']]));
  const library = createLibrary(); library.put(meaning('a'));
  const event = [...library.pending.values()][0];
  assert.throws(() => read(event, { ...event, action: 'delete', value: null }));
  assert.throws(() => read({ ...event, key: 'wrong' }));
  assert.throws(() => validateMeaning({ ...meaning('a'), source: 'javascript:alert(1)' }));
  assert.equal(library.selected.size, 1);
});

test('manual meanings remain distinct and restore through the existing export format', () => {
  const library = createLibrary();
  library.put({ ...meaning('manual-1'), origin: 'manual' });
  library.put({ ...meaning('manual-2'), origin: 'manual' });
  const restored = createLibrary();
  JSON.parse(JSON.stringify([...library.selected.values()])).forEach(restored.put);
  assert.equal(restored.selected.size, 2);
  assert.deepEqual([...restored.selected.values()], [...library.selected.values()]);
});

test('sheet links accept Google document IDs but not lookalike sites', () => {
  assert.equal(parseSheetId('https://docs.google.com/spreadsheets/d/invented-id/edit#gid=0'), 'invented-id');
  assert.throws(() => parseSheetId('https://docs.google.com.evil.test/spreadsheets/d/invented-id/edit'));
  assert.throws(() => parseSheetId('https://docs.google.com/spreadsheets/'));
});
