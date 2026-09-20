import test from 'node:test';
import assert from 'node:assert/strict';
import { deeplTranslationUrl } from '../web/translation.js';

test('DeepL link translates one German definition into English', () => {
  assert.equal(
    deeplTranslationUrl('eine längliche Sitzgelegenheit für mehrere Personen'),
    'https://www.deepl.com/translator#de/en/eine%20l%C3%A4ngliche%20Sitzgelegenheit%20f%C3%BCr%20mehrere%20Personen',
  );
  assert.throws(() => deeplTranslationUrl('  '), /leere Definition/);
});
