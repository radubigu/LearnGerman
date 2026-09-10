import { validateGrammar } from './grammar.js';
export const LIBRARY_TAB = 'LearnGerman_V1';
export const LIBRARY_HEADER = ['LearnGerman events v1', 'Aktion', 'Schlüssel', 'Bedeutung JSON'];
export function selectionKey(item) {
  const reference = item.dictionaryReference ?? item;
  return item.origin === 'manual' ? `manual:${item.id}` : JSON.stringify([reference.word, reference.entryIndex, reference.senseIndex, reference.definition]);
}
export function validateMeaning(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Ungültige Bedeutung.');
  for (const field of ['id', 'word', 'definition']) {
    if (typeof item[field] !== 'string' || !item[field].trim()) throw new Error(`Bedeutung ohne gültiges Feld: ${field}.`);
  }
  for (const field of ['singular', 'plural', 'possiblePartsOfSpeech']) {
    if (!Array.isArray(item[field]) || item[field].some(value => typeof value !== 'string')) throw new Error(`Ungültige Angaben: ${field}.`);
  }
  if (typeof item.pos !== 'string' || typeof item.source !== 'string' || typeof item.example !== 'string') throw new Error('Ungültige Wortangaben.');
  if (item.origin !== 'manual' && (!Number.isInteger(item.entryIndex) || item.entryIndex < 0 || typeof item.senseIndex !== 'string')) throw new Error('Ungültige Wörterbuchreferenz.');
  if (item.dictionaryReference !== undefined) {
    const ref = item.dictionaryReference;
    if (!ref || typeof ref !== 'object' || Array.isArray(ref) || typeof ref.word !== 'string' || !ref.word.trim() || typeof ref.definition !== 'string' || !ref.definition.trim() || !Number.isInteger(ref.entryIndex) || ref.entryIndex < 0 || typeof ref.senseIndex !== 'string') throw new Error('Ungültige ursprüngliche Wörterbuchreferenz.');
  }
  if (item.originalDefinition !== undefined && typeof item.originalDefinition !== 'string') throw new Error('Ungültige ursprüngliche Bedeutung.');
  if (item.source) {
    let url;
    try { url = new URL(item.source); } catch { throw new Error('Ungültiger Quellenlink.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Ungültiger Quellenlink.');
  }
  if (JSON.stringify(item).length > 45000) throw new Error('Diese Bedeutung ist zu groß für eine Tabellenzelle.');
  validateGrammar(item.grammar, item.pos);
  if (item.grammarSource !== undefined && !['manual', 'dictionary'].includes(item.grammarSource)) throw new Error('Ungültige Herkunft der Wortformen.');
  return item;
}
export function parseEvents(rows) {
  if (!Array.isArray(rows) || JSON.stringify(rows[0]) !== JSON.stringify(LIBRARY_HEADER)) throw new Error('Keine LearnGerman-Vokabeltabelle (Version 1). Bitte die mit dieser App erstellte Vokabeltabelle öffnen.');
  const events = [], seen = new Map();
  for (const [index, row] of rows.slice(1).entries()) {
    if (!Array.isArray(row) || row.length !== 4 || row.some(value => typeof value !== 'string')) throw new Error('Beschädigte Tabellenzeile. Die Auswahl wurde nicht ersetzt.');
    const [id, action, key, json] = row;
    if (!id || !key || !['put', 'delete'].includes(action)) throw new Error('Ungültige Tabellenänderung.');
    let value;
    try { value = JSON.parse(json); } catch { throw new Error('Unlesbare Bedeutung in der Tabelle.'); }
    if (action === 'put') {
      try { validateMeaning(value); }
      catch (error) { throw new Error(`Vokabeltabelle, Zeile ${index + 2}: ${error.message}`); }
      if (selectionKey(value) !== key) throw new Error('Widersprüchliche Wortkennung.');
    }
    else if (value !== null) throw new Error('Ungültige Löschmarkierung.');
    const signature = JSON.stringify(row);
    if (seen.has(id)) {
      if (seen.get(id) !== signature) throw new Error('Widersprüchliche doppelte Änderungs-ID.');
      continue;
    }
    seen.set(id, signature); events.push({ id, action, key, value });
  }
  return events;
}
export const eventRows = events => events.map(event => [event.id, event.action, event.key, JSON.stringify(event.value)]);
export function createLibrary() {
  const selected = new Map(), pending = new Map();
  function put(item) {
    validateMeaning(item);
    const key = selectionKey(item);
    const event = { id: crypto.randomUUID(), action: 'put', key, value: structuredClone(item) };
    selected.set(key, event.value); pending.set(event.id, event);
  }
  function remove(key) {
    if (!selected.has(key)) return;
    const event = { id: crypto.randomUUID(), action: 'delete', key, value: null };
    selected.delete(key); pending.set(event.id, event);
  }
  function accept(events) {
    for (const event of events) {
      const local = pending.get(event.id);
      if (local && JSON.stringify(local) !== JSON.stringify(event)) throw new Error('Widersprüchliche Änderungs-ID.');
    }
    // Acknowledge only operations actually read back from Google.
    events.forEach(event => pending.delete(event.id));
    selected.clear();
    for (const event of [...events, ...pending.values()]) {
      if (event.action === 'delete') selected.delete(event.key);
      else selected.set(event.key, event.value);
    }
  }
  return { selected, pending, put, remove, accept };
}
export function parseSheetId(input) {
  const value = String(input).trim();
  if (/^[\w-]{10,}$/.test(value)) return value;
  let url;
  try { url = new URL(value); } catch { throw new Error('Bitte einen gültigen Google-Sheets-Link eingeben.'); }
  const match = /^\/spreadsheets\/d\/([\w-]+)(?:\/|$)/u.exec(url.pathname);
  if (url.origin !== 'https://docs.google.com' || !match) throw new Error('Bitte einen Google-Sheets-Link eingeben.');
  return match[1];
}
