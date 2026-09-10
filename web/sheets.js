import { LIBRARY_TAB, LIBRARY_HEADER, parseEvents, eventRows } from './library.js';
import { REVIEW_TAB, REVIEW_HEADER, parseReviews, reviewRows, mergeReviews } from './practice.js';
export const FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// The token only exists in this module's closure. No token is written to storage.
export function createSheetsClient({ fetcher = globalThis.fetch, now = Date.now } = {}) {
  let token = null;
  let expiresAt = 0;
  function disconnect() { token = null; expiresAt = 0; }
  function authorize(clientId) {
    return new Promise((resolve, reject) => {
      disconnect();
      if (!globalThis.google?.accounts?.oauth2) return reject(new Error('Google-Anmeldung ist noch nicht geladen. Bitte erneut versuchen.'));
      if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) return reject(new Error('Bitte eine gültige Google OAuth Client-ID eingeben.'));
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: FILE_SCOPE, include_granted_scopes: false,
        callback: response => {
          if (response.error || !response.access_token) return reject(new Error('Google-Zugriff wurde nicht erteilt.'));
          if (!String(response.scope).split(' ').includes(FILE_SCOPE)) return reject(new Error('Die Berechtigung für die Tabelle fehlt.'));
          token = response.access_token;
          expiresAt = now() + Number(response.expires_in) * 1000 - 30000;
          resolve();
        },
        error_callback: () => reject(new Error('Google-Anmeldung wurde geschlossen oder blockiert. Bitte erneut verbinden.')),
      });
      client.requestAccessToken({ prompt: 'select_account' });
    });
  }
  async function request(path, options = {}) {
    if (!token || now() >= expiresAt) { disconnect(); throw new Error('Bitte Google erneut verbinden.'); }
    let response;
    try {
      response = await fetcher(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
        ...options, signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
    } catch { throw new Error('Verbindung unterbrochen. Änderungen bleiben unbestätigt. Bitte erneut laden oder speichern; bei einer neuen Tabelle zuerst Google Drive prüfen.'); }
    if (response.status === 401) { disconnect(); throw new Error('Google-Verbindung abgelaufen. Bitte erneut verbinden.'); }
    if (!response.ok) throw new Error(response.status === 403
      ? 'Kein Zugriff. Bitte Google Sheets API und die Dateiberechtigung prüfen.'
      : `Google Sheets meldet einen Fehler (HTTP ${response.status}).`);
    return response.json();
  }
  async function createTestSheet() {
    // Creating a file with drive.file grants access to that file; no broad Drive scope.
    const data = await request('', { method: 'POST', body: JSON.stringify({
      properties: { title: 'LearnGerman — Verbindungstest' },
      sheets: [{ properties: { title: 'Verbindungstest' }, data: [{ rowData: [
        { values: ['ID', 'Wort', 'Bedeutung'].map(stringValue => ({ userEnteredValue: { stringValue } })) },
        { values: ['connection-test-v1', 'das Buch', 'Ein Text mit vielen Seiten, die zusammengebunden sind.'].map(stringValue => ({ userEnteredValue: { stringValue } })) },
      ] }] }],
    }) });
    if (!/^[\w-]+$/.test(data.spreadsheetId)) throw new Error('Google hat keine gültige Tabellen-ID zurückgegeben.');
    return data.spreadsheetId;
  }
  async function verifyTestSheet(id) {
    if (!/^[\w-]+$/.test(id)) throw new Error('Ungültige Tabellen-ID.');
    const data = await request(`/${id}/values/${encodeURIComponent("'Verbindungstest'!A2:C2")}`);
    if (data.values?.[0]?.[0] !== 'connection-test-v1' || data.values?.[0]?.[1] !== 'das Buch') {
      throw new Error('Die erwartete Testzeile wurde nicht gefunden.');
    }
    return data.values[0];
  }
  function libraryPath(id) {
    if (!/^[\w-]+$/.test(id)) throw new Error('Ungültige Tabellen-ID.');
    return `/${id}/values/${encodeURIComponent(`'${LIBRARY_TAB}'!A:D`)}`;
  }
  async function createLibrarySheet() {
    const data = await request('', { method: 'POST', body: JSON.stringify({
      properties: { title: 'LearnGerman — Wortschatz' },
      sheets: [{ properties: { title: LIBRARY_TAB, gridProperties: { frozenRowCount: 1 } }, data: [{ rowData: [
        { values: LIBRARY_HEADER.map(stringValue => ({ userEnteredValue: { stringValue } })) },
      ] }] }],
    }) });
    if (!/^[\w-]+$/.test(data.spreadsheetId)) throw new Error('Keine gültige Tabellen-ID erhalten. Bitte Google Drive vor einem erneuten Erstellen prüfen.');
    return data.spreadsheetId;
  }
  async function readLibrary(id) {
    const data = await request(libraryPath(id));
    return parseEvents(data.values);
  }
  async function saveLibrary(id, pending) {
    // Read-before-append reduces duplicate writes, but deduplication by event ID
    // is what makes uncertain responses and concurrent retries safe.
    const before = await readLibrary(id);
    const seen = new Map(before.map(event => [event.id, JSON.stringify(event)]));
    for (const event of pending) {
      if (seen.has(event.id) && seen.get(event.id) !== JSON.stringify(event)) throw new Error('Widersprüchliche Änderungs-ID.');
    }
    const missing = pending.filter(event => !seen.has(event.id));
    if (missing.length) {
      const rows = eventRows(missing);
      parseEvents([LIBRARY_HEADER, ...rows]);
      await request(`${libraryPath(id)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values: rows }),
      });
    }
    const after = await readLibrary(id);
    const saved = new Set(after.map(event => event.id));
    if (pending.some(event => !saved.has(event.id))) throw new Error('Speicherung noch nicht bestätigt. Bitte erneut speichern.');
    return after;
  }
  async function hasReviewTab(id) {
    libraryPath(id); // Validate the identifier before using it in another route.
    const metadata = await request(`/${id}?fields=sheets.properties`);
    if (!Array.isArray(metadata.sheets)) throw new Error('Tabellenstruktur konnte nicht gelesen werden.');
    return metadata.sheets.some(sheet => sheet.properties?.title === REVIEW_TAB);
  }
  const reviewPath = id => `/${id}/values/${encodeURIComponent(`'${REVIEW_TAB}'!A:B`)}`;
  async function readReviews(id) {
    if (!await hasReviewTab(id)) return [];
    const data = await request(reviewPath(id));
    return parseReviews(data.values);
  }
  async function ensureReviewTab(id) {
    if (await hasReviewTab(id)) return;
    const sheetId = crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647;
    try {
      // One atomic batch creates the tab and its schema marker together.
      await request(`/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [
        { addSheet: { properties: { sheetId, title: REVIEW_TAB, gridProperties: { frozenRowCount: 1 } } } },
        { updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: [{ values: REVIEW_HEADER.map(stringValue => ({ userEnteredValue: { stringValue } })) }], fields: 'userEnteredValue' } },
      ] }) });
    } catch (error) {
      // Another device or a lost successful response may have created it.
      if (!await hasReviewTab(id)) throw error;
    }
  }
  async function verifyLibrarySchema(id) {
    // Verify ownership/schema without reparsing unrelated vocabulary payloads.
    // A damaged vocabulary row must not prevent backing up valid answers.
    libraryPath(id);
    const header = await request(`/${id}/values/${encodeURIComponent(`'${LIBRARY_TAB}'!A1:D1`)}`);
    parseEvents(header.values);
  }
  async function saveReviews(id, pending) {
    await verifyLibrarySchema(id);
    const changes = mergeReviews(pending);
    await ensureReviewTab(id);
    const before = await readReviews(id);
    mergeReviews(before, changes); // Detect conflicting retry IDs before any write.
    const seen = new Set(before.map(event => event.id));
    const missing = changes.filter(event => !seen.has(event.id));
    if (missing.length) await request(`${reviewPath(id)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values: reviewRows(missing) }),
    });
    const after = await readReviews(id);
    mergeReviews(after, changes);
    const saved = new Set(after.map(event => event.id));
    if (changes.some(event => !saved.has(event.id))) throw new Error('Lernfortschritt noch nicht bestätigt. Bitte erneut speichern.');
    return after;
  }
  return { authorize, disconnect, createTestSheet, verifyTestSheet, createLibrarySheet, readLibrary, saveLibrary,
    readReviews, saveReviews, verifyLibrarySchema,
    isConnected: () => Boolean(token && now() < expiresAt) };
}
