import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheetsClient, FILE_SCOPE, IMPORT_BATCH_SIZE, IMPORT_HEADER, IMPORT_TAB, parseImportBaseList, takeImportBatch } from '../web/sheets.js';
import { createLibrary, LIBRARY_HEADER, eventRows } from '../web/library.js';
import { REVIEW_TAB, REVIEW_HEADER, reviewRows } from '../web/practice.js';

function googleStub(grant = {}) {
  let config;
  globalThis.google = { accounts: { oauth2: { initTokenClient(input) {
    config = input;
    return { requestAccessToken() { input.callback({ access_token: 'invented-test-token', expires_in: 3600, scope: FILE_SCOPE, ...grant }); } };
  } } } };
  return () => config;
}
test('Sheets test uses per-file permission, creates only a new file, then verifies the example', async () => {
  const config = googleStub();
  const calls = [];
  const client = createSheetsClient({ fetcher: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => options.method === 'POST'
      ? { spreadsheetId: 'invented-sheet-id' } : { values: [['connection-test-v1', 'das Buch', 'Test']] } };
  } });
  await client.authorize('invented.apps.googleusercontent.com');
  const id = await client.createTestSheet();
  await client.verifyTestSheet(id);
  assert.equal(config().scope, FILE_SCOPE);
  assert.equal(config().include_granted_scopes, false);
  assert.equal(calls[0].url, 'https://sheets.googleapis.com/v4/spreadsheets');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[1].options.method, undefined);
  assert.match(calls[1].url, /invented-sheet-id\/values/);
  assert.equal(JSON.stringify(client).includes('invented-test-token'), false);
  client.disconnect();
  await assert.rejects(client.verifyTestSheet(id), /erneut verbinden/);
});
test('new vocabulary sheets include an empty import_baselist queue', async () => {
  googleStub(); let requestBody;
  const client = createSheetsClient({ fetcher: async (url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ spreadsheetId: 'invented-sheet-id' }) };
  } });
  await client.authorize('invented.apps.googleusercontent.com');
  await client.createLibrarySheet();
  assert.deepEqual(requestBody.sheets.map(sheet => sheet.properties.title), ['LearnGerman_V1', IMPORT_TAB]);
  assert.deepEqual(requestBody.sheets[1].data[0].rowData[0].values.map(cell => cell.userEnteredValue.stringValue), IMPORT_HEADER);
});
test('expired tokens are not sent and denied scopes prevent requests', async () => {
  googleStub(); let time = 0; let calls = 0;
  const client = createSheetsClient({ now: () => time, fetcher: async () => { calls++; } });
  await client.authorize('invented.apps.googleusercontent.com');
  time = 3600000;
  await assert.rejects(client.createTestSheet(), /erneut verbinden/);
  assert.equal(calls, 0);
  googleStub({ scope: 'unrelated' });
  await assert.rejects(client.authorize('invented.apps.googleusercontent.com'), /Berechtigung/);
});
test('401 clears authorization and malformed test data never counts as success', async () => {
  googleStub(); let code = 200;
  const client = createSheetsClient({ fetcher: async () => ({ ok: code === 200, status: code, json: async () => ({ values: [['different', 'das Buch']] }) }) });
  await client.authorize('invented.apps.googleusercontent.com');
  await assert.rejects(client.verifyTestSheet('invented'), /nicht gefunden/);
  code = 401;
  await assert.rejects(client.verifyTestSheet('invented'), /abgelaufen/);
  await assert.rejects(client.verifyTestSheet('invented'), /erneut verbinden/);
});

test('library save appends raw values, confirms readback, and safely retries a lost response', async () => {
  googleStub(); const rows = [LIBRARY_HEADER]; let writes = 0; let loseResponse = true;
  const client = createSheetsClient({ fetcher: async (url, options) => {
    if (url.includes(':append')) {
      writes++; assert.match(url, /valueInputOption=RAW/);
      rows.push(...JSON.parse(options.body).values);
      if (loseResponse) { loseResponse = false; throw new Error('simulated lost response'); }
    }
    return { ok: true, status: 200, json: async () => ({ values: structuredClone(rows) }) };
  } });
  await client.authorize('invented.apps.googleusercontent.com');
  const library = createLibrary();
  library.put({ id: 'manual', origin: 'manual', word: 'Übung', definition: '=invented text', pos: 'noun', possiblePartsOfSpeech: ['noun'], singular: ['die Übung'], plural: ['die Übungen'], source: '', example: '' });
  const pending = [...library.pending.values()];
  await assert.rejects(client.saveLibrary('invented-id', pending), /unterbrochen/);
  assert.equal(library.pending.size, 1);
  library.accept(await client.saveLibrary('invented-id', pending));
  assert.equal(writes, 1);
  assert.equal(library.pending.size, 0);
  assert.equal([...library.selected.values()][0].definition, '=invented text');
});

test('library schema is checked before writes and missing readback never counts as saved', async () => {
  googleStub(); let writes = 0; let valid = false;
  const client = createSheetsClient({ fetcher: async (url, options) => {
    if (options.method === 'POST') writes++;
    return { ok: true, status: 200, json: async () => ({ values: [valid ? LIBRARY_HEADER : ['unrelated personal sheet']] }) };
  } });
  await client.authorize('invented.apps.googleusercontent.com');
  const pending = [{ id: 'delete-id', action: 'delete', key: 'manual:old', value: null }];
  await assert.rejects(client.saveLibrary('invented-id', pending), /Keine LearnGerman/);
  assert.equal(writes, 0);
  valid = true;
  await assert.rejects(client.saveLibrary('invented-id', pending), /nicht bestätigt/);
  assert.equal(writes, 1);
});

test('concurrent additions between pre-read and append are returned, never overwritten', async () => {
  googleStub(); const rows = [LIBRARY_HEADER];
  const other = { id: 'remote-event', action: 'delete', key: 'manual:other', value: null };
  const local = { id: 'local-event', action: 'delete', key: 'manual:local', value: null };
  const client = createSheetsClient({ fetcher: async (url, options) => {
    if (options.method === 'POST') rows.push(...eventRows([other]), ...JSON.parse(options.body).values);
    return { ok: true, status: 200, json: async () => ({ values: structuredClone(rows) }) };
  } });
  await client.authorize('invented.apps.googleusercontent.com');
  const saved = await client.saveLibrary('invented-id', [local]);
  assert.deepEqual(saved.map(event => event.id), ['remote-event', 'local-event']);
});

test('import_baselist accepts its original two columns and filters durable statuses', () => {
  const parsed = parseImportBaseList([
    ['german_word', 'english_meaning'],
    ['Bank', 'bench'],
    ['kennen', 'to know', 'SKIPPED'],
    ['Schloss', 'castle', 'added'],
    [],
  ]);
  assert.deepEqual(parsed.pending, [{ rowNumber: 2, word: 'Bank', englishHint: 'bench', status: '' }]);
  assert.equal(parsed.skipped, 1);
  assert.equal(parsed.added, 1);
  assert.equal(parsed.hasStatusHeader, false);
  assert.throws(() => parseImportBaseList([['german_word', 'english_meaning', 'status'], ['Bank', 'bench', 'done']]), /unbekannter Status/);
  assert.throws(() => parseImportBaseList([['german_word', 'english_meaning'], ['Bank']]), /Zeile 2/);
});

test('import_baselist review batches contain at most 50 open rows', () => {
  const values = [
    ['german_word', 'english_meaning', 'status'],
    ...Array.from({ length: 55 }, (_, index) => [`Wort ${index + 1}`, `meaning ${index + 1}`, '']),
    ['Bekannt', 'known', 'skipped'],
  ];
  const parsed = parseImportBaseList(values);
  const batch = takeImportBatch(parsed);
  assert.equal(IMPORT_BATCH_SIZE, 50);
  assert.equal(batch.pending.length, 50);
  assert.equal(batch.pendingTotal, 55);
  assert.equal(batch.remainingAfterBatch, 5);
  assert.equal(batch.pending[0].rowNumber, 2);
  assert.equal(batch.pending[49].rowNumber, 51);
  assert.equal(batch.skipped, 1);
  assert.equal(parsed.pending.length, 55);
});

test('import_baselist status writes add the status header, verify row identity and confirm readback', async () => {
  googleStub();
  const rows = [['german_word', 'english_meaning'], ['Bank', 'bench'], ['kennen', 'to know', 'skipped']];
  let writes = 0;
  const client = createSheetsClient({ fetcher: async (url, request) => {
    const decoded = decodeURIComponent(url);
    if (url.endsWith('/values:batchUpdate')) {
      writes++;
      const body = JSON.parse(request.body);
      assert.equal(body.valueInputOption, 'RAW');
      assert.deepEqual(body.data.map(item => item.range), [`'${IMPORT_TAB}'!C1`, `'${IMPORT_TAB}'!C2`]);
      rows[0][2] = IMPORT_HEADER[2]; rows[1][2] = 'added';
      return { ok: true, status: 200, json: async () => ({}) };
    }
    assert.match(decoded, /'import_baselist'!A:C/);
    return { ok: true, status: 200, json: async () => ({ values: structuredClone(rows) }) };
  } });
  await client.authorize('invented.apps.googleusercontent.com');
  const before = await client.readImportBaseList('invented-id');
  assert.equal(before.pending.length, 1);
  const after = await client.saveImportStatuses('invented-id', [{ ...before.pending[0], status: 'added' }]);
  assert.equal(writes, 1);
  assert.equal(after.pending.length, 0);
  assert.equal(after.added, 1);
  await client.saveImportStatuses('invented-id', [{ rowNumber: 2, word: 'Bank', englishHint: 'bench', status: 'added' }]);
  assert.equal(writes, 1);
  await assert.rejects(client.saveImportStatuses('invented-id', [{ rowNumber: 2, word: 'Bankkonto', englishHint: 'bench', status: 'added' }]), /verändert/);
});

const practiceEvent = { id: 'answer-1', sessionId: 'session-1', questionKey: 'a'.repeat(64), dimension: 'article', mode: 'choice', correct: true, at: 1000 };
async function practiceTransport(options = {}) {
  googleStub();
  const state = { exists: false, rows: [REVIEW_HEADER], libraryRows: [LIBRARY_HEADER], calls: [], writes: 0, creates: 0, ...options };
  const client = createSheetsClient({ fetcher: async (url, request) => {
    state.calls.push({ url, request });
    const decoded = decodeURIComponent(url);
    let data;
    if (state.denied) return { ok: false, status: 403, json: async () => ({}) };
    if (decoded.includes("'LearnGerman_V1'!A1:D1")) data = { values: state.libraryRows.slice(0, 1) };
    else if (decoded.includes("'LearnGerman_V1'!A:D")) data = { values: state.libraryRows };
    else if (url.endsWith('?fields=sheets.properties')) data = { sheets: state.exists ? [{ properties: { title: REVIEW_TAB } }] : [{ properties: { title: 'LearnGerman_V1' } }] };
    else if (url.endsWith(':batchUpdate')) {
      state.creates++;
      const { requests } = JSON.parse(request.body);
      assert.equal(requests.length, 2);
      assert.equal(requests[0].addSheet.properties.title, REVIEW_TAB);
      assert.equal(requests[1].updateCells.start.sheetId, requests[0].addSheet.properties.sheetId);
      assert.deepEqual(requests[1].updateCells.rows[0].values.map(cell => cell.userEnteredValue.stringValue), REVIEW_HEADER);
      state.exists = true; data = {};
      if (state.loseCreate) { state.loseCreate = false; throw new Error('lost create response'); }
    } else if (decoded.includes(`'${REVIEW_TAB}'!A:B`)) {
      if (url.includes(':append')) {
        assert.match(url, /valueInputOption=RAW&insertDataOption=INSERT_ROWS/);
        state.writes++;
        if (state.concurrent) { state.rows.push(...reviewRows([state.concurrent])); state.concurrent = null; }
        if (!state.dropWrite) state.rows.push(...JSON.parse(request.body).values);
        if (state.loseAppend) { state.loseAppend = false; throw new Error('lost append response'); }
      }
      data = { values: state.rows };
    } else assert.fail(`Unexpected route: ${decoded}`);
    return { ok: true, status: 200, json: async () => structuredClone(data) };
  } });
  await client.authorize('invented.apps.googleusercontent.com');
  return { client, state };
}

test('old vocabulary tables load empty progress without any writes; first save creates the review schema atomically', async () => {
  const { client, state } = await practiceTransport();
  assert.deepEqual(await client.readReviews('invented-id'), []);
  assert.equal(state.calls.some(call => call.request.method === 'POST'), false);
  assert.deepEqual(await client.saveReviews('invented-id', [practiceEvent]), [practiceEvent]);
  assert.equal(state.creates, 1);
  assert.equal(state.writes, 1);
  assert.deepEqual(state.libraryRows, [LIBRARY_HEADER]);
});

test('practice save recovers lost creation and append responses, deduplicating retries', async () => {
  const { client, state } = await practiceTransport({ loseCreate: true, loseAppend: true });
  await assert.rejects(client.saveReviews('invented-id', [practiceEvent]), /unterbrochen/);
  assert.deepEqual(await client.saveReviews('invented-id', [practiceEvent]), [practiceEvent]);
  assert.equal(state.creates, 1);
  assert.equal(state.writes, 1);
});

test('review schema, vocabulary identity, access denial and missing readback fail visibly', async () => {
  const { client, state } = await practiceTransport({ libraryRows: [['unrelated sheet']] });
  await assert.rejects(client.saveReviews('invented-id', [practiceEvent]), /Keine LearnGerman/);
  assert.equal(state.creates, 0);
  state.libraryRows = [LIBRARY_HEADER]; state.exists = true; state.rows = [['bad practice schema']];
  await assert.rejects(client.saveReviews('invented-id', [practiceEvent]), /Format/);
  assert.equal(state.writes, 0);
  state.rows = [REVIEW_HEADER]; state.dropWrite = true;
  await assert.rejects(client.saveReviews('invented-id', [practiceEvent]), /nicht bestätigt/);
  state.denied = true;
  await assert.rejects(client.readReviews('invented-id'), /Kein Zugriff/);
});

test('concurrent practice results merge while conflicting event IDs are rejected before append', async () => {
  const other = { ...practiceEvent, id: 'other-answer', sessionId: 'other-session', correct: false };
  const { client, state } = await practiceTransport({ exists: true, concurrent: other });
  assert.deepEqual(await client.saveReviews('invented-id', [practiceEvent]), [other, practiceEvent]);
  await assert.rejects(client.saveReviews('invented-id', [{ ...practiceEvent, correct: false }]), /Widersprüchliche/);
  assert.equal(state.writes, 1);
});

test('a malformed vocabulary payload cannot block saving valid practice answers or modify vocabulary', async () => {
  const libraryRows = [LIBRARY_HEADER, ['broken-put', 'put', 'manual:example', 'null']];
  const { client, state } = await practiceTransport({ libraryRows });
  await assert.rejects(client.readLibrary('invented-id'), /Zeile 2: Ungültige Bedeutung/);
  await client.verifyLibrarySchema('invented-id'); // Allows reopening progress recovery after a refresh.
  state.calls.length = 0;
  assert.deepEqual(await client.saveReviews('invented-id', [practiceEvent]), [practiceEvent]);
  assert.equal(state.calls.some(call => decodeURIComponent(call.url).includes("'LearnGerman_V1'!A:D")), false);
  assert.deepEqual(state.libraryRows, libraryRows);
});
