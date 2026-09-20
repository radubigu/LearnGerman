import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWordList } from '../web/word-list.js';

test('pasted lines, commas, semicolons and spreadsheet tabs retain order and case', () => {
  const parsed = parseWordList(' essen\r\nEssen, freundlich;überlegen\tessen ');
  assert.deepEqual(parsed.words, ['essen', 'Essen', 'freundlich', 'überlegen']);
  assert.deepEqual(parsed.items, parsed.words.map(word => ({ word, englishHint: '' })));
  assert.equal(parsed.duplicates, 1);
});

test('two-column imports retain English hints and accept spreadsheet tabs or quoted CSV', () => {
  assert.deepEqual(parseWordList('Deutsch\tEnglish\nBank\tbench\nSchloss\tcastle', 'columns').items, [
    { word: 'Bank', englishHint: 'bench' },
    { word: 'Schloss', englishHint: 'castle' },
  ]);
  assert.deepEqual(parseWordList('German,Meaning\nBank,"bench, seat"', 'columns').items, [
    { word: 'Bank', englishHint: 'bench, seat' },
  ]);
});

test('two-column imports require both fields and reject ambiguous extra columns', () => {
  assert.throws(() => parseWordList('Bank', 'columns'), /genau zwei/);
  assert.throws(() => parseWordList('Bank,bench,seat', 'columns'), /genau zwei/);
  assert.throws(() => parseWordList('Bank,', 'columns'), /genau zwei/);
});

test('line mode keeps commas inside phrases and automatic mode accepts quoted CSV cells', () => {
  assert.deepEqual(parseWordList('sich freuen, auf\nBank', 'lines').words, ['sich freuen, auf', 'Bank']);
  assert.deepEqual(parseWordList('"sich freuen, auf",Bank').words, ['sich freuen, auf', 'Bank']);
});

test('word list rejects empty, oversized and malformed inputs before review', () => {
  assert.throws(() => parseWordList('  ,\n;'), /mindestens ein Wort/);
  assert.throws(() => parseWordList('x'.repeat(151)), /länger als 150/);
  assert.throws(() => parseWordList(Array.from({ length: 101 }, (_, index) => `Wort${index}`).join('\n')), /höchstens 100/);
  assert.throws(() => parseWordList('"offen'), /Anführungszeichen/);
});
