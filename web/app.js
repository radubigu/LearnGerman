import { createDictionary, mapEntries, wordTypeLabel, nounColor } from './dictionary.js';
import { createSheetsClient } from './sheets.js';
import { createManualEntry, wiktionarySearchUrl } from './manual-entry.js';
import { createLibrary, parseSheetId, validateMeaning, selectionKey } from './library.js';
import { GRAMMAR_FIELDS } from './grammar.js';
import { createPracticeUI } from './practice-ui.js';
import { editMeaning } from './edit-entry.js';

const $ = selector => document.querySelector(selector);
const dictionary = createDictionary();
const sheets = createSheetsClient();
const library = createLibrary();
const selected = library.selected;
let controller;
let sheetId = '';
let googleReady;
let manualDirty = false;
let libraryId = '';
let googleBusy = false;
let undoItem = null;
const grammarDrafts = new Map();
let practice;
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
function link(text, url) { const element = node('a', text); element.href = url; element.target = '_blank'; element.rel = 'noreferrer'; return element; }
function status(selector, message, error = false) { $(selector).textContent = message; $(selector).classList.toggle('error', error); }
function typeLabel(entry) {
  const label = wordTypeLabel(entry.pos ? [entry.pos] : entry.possiblePartsOfSpeech ?? []);
  return !entry.pos && entry.possiblePartsOfSpeech?.length > 1 ? `${label} · Zuordnung offen` : label;
}
function appendForms(parent, forms, number) {
  forms.forEach((form, index) => {
    if (index) parent.append(document.createTextNode(' / '));
    const match = /^(der|die|das)(\s+.*)$/u.exec(form);
    if (match) parent.append(node('span', match[1], `noun-form ${nounColor(form, number)}`), document.createTextNode(match[2]));
    else parent.append(document.createTextNode(form));
  });
}
function wordHeading(entry, tag = 'strong') {
  const heading = node(tag, undefined, 'word-heading');
  if (entry.singular.length) appendForms(heading, entry.singular, 'singular');
  else if (entry.plural.length) appendForms(heading, entry.plural, 'plural');
  else heading.textContent = entry.word;
  return heading;
}
function appendWordGrammar(parent, entry) {
  const fields = GRAMMAR_FIELDS[entry.pos];
  if (!fields) return;
  const grammar = node('dl', undefined, 'word-grammar');
  for (const [key, label] of fields) {
    grammar.append(node('dt', label), node('dd', entry.grammar?.[key]?.join(' / ') || 'Keine Angabe'));
  }
  parent.append(grammar);
  if (entry.grammarSource === 'manual') parent.append(node('p', 'Wortformen manuell angegeben.', 'hint'));
}
function appendGrammarFields(parent, pos, grammar = {}, prefix = 'grammar') {
  for (const [key, label, placeholder] of GRAMMAR_FIELDS[pos] ?? []) {
    const field = node('div');
    const caption = node('label', label); caption.htmlFor = `${prefix}-${key}`;
    const input = node('input'); input.id = caption.htmlFor; input.name = key; input.placeholder = placeholder;
    input.value = Array.isArray(grammar[key]) ? grammar[key].join('; ') : grammar[key] ?? '';
    input.maxLength = 2000; field.append(caption, input); parent.append(field);
  }
}
function appendGrammarEditor(parent, item, key) {
  const details = node('details', undefined, 'grammar-editor');
  details.append(node('summary', 'Wort bearbeiten'));
  const form = node('form');
  const draft = grammarDrafts.get(key);
  details.open = Boolean(draft);
  const values = draft ?? { ...item, singular: item.singular.join('; '), plural: item.plural.join('; ') };
  const prefix = `edit-${crypto.randomUUID()}`;
  function field(name, caption, type = 'input', maxLength = 150) {
    const wrapper = node('div'), label = node('label', caption), input = node(type);
    input.id = `${prefix}-${name}`; input.name = name; label.htmlFor = input.id;
    input.value = values[name] ?? ''; input.maxLength = maxLength;
    if (['word', 'definition'].includes(name)) input.required = true;
    if (type === 'textarea') input.rows = 3;
    wrapper.append(label, input); form.append(wrapper); return wrapper;
  }
  field('word', 'Wort / Grundform');
  const label = node('label', 'Wortart'), pos = $('#manual-pos').cloneNode(true);
  pos.id = `${prefix}-pos`; pos.name = 'pos'; pos.removeAttribute('aria-describedby'); label.htmlFor = pos.id; pos.value = values.pos;
  form.append(label, pos);
  field('definition', 'Bedeutung', 'textarea', 5000);
  field('example', 'Beispielsatz (optional)', 'textarea', 1000);
  const singular = field('singular', 'Singular mit Artikel (z. B. der Fluss)', 'input', 2000);
  const plural = field('plural', 'Plural mit Artikel (z. B. die Flüsse)', 'input', 2000);
  const nounHint = node('p', 'Vollständige Formen; Alternativen mit ; trennen. Unbekannte Formen leer lassen. Bei Nur-Plural-Wörtern den Singular leer lassen.', 'hint'); form.append(nounHint);
  const grammarFields = node('div'); form.append(grammarFields);
  function showFields() {
    for (const wrapper of [singular, plural]) { wrapper.hidden = pos.value !== 'noun'; wrapper.querySelector('input').disabled = wrapper.hidden; }
    nounHint.hidden = pos.value !== 'noun';
    grammarFields.replaceChildren();
    appendGrammarFields(grammarFields, pos.value, draft ?? item.grammar, prefix);
  }
  showFields(); pos.addEventListener('change', () => { showFields(); grammarDrafts.set(key, Object.fromEntries(new FormData(form))); });
  form.append(node('p', 'Änderungen übernehmen und danach in Google Sheets speichern.', 'hint'));
  const save = node('button', 'Änderungen übernehmen', 'secondary'); save.type = 'submit';
  const cancel = node('button', 'Abbrechen', 'text-button'); cancel.type = 'button';
  cancel.addEventListener('click', () => { grammarDrafts.delete(key); updateSelection(); });
  const errorMessage = node('p', '', 'error'); errorMessage.setAttribute('role', 'status');
  form.append(save, cancel, errorMessage);
  form.addEventListener('input', () => grammarDrafts.set(key, Object.fromEntries(new FormData(form))));
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const current = selected.get(key);
      if (!current) throw new Error('Diese Bedeutung ist nicht mehr ausgewählt.');
      library.put(editMeaning(current, Object.fromEntries(new FormData(form))));
      grammarDrafts.delete(key); updateSelection();
    } catch (error) { errorMessage.textContent = error.message; }
  });
  details.append(form); parent.append(details);
}

function updateSelection() {
  $('#count').textContent = selected.size;
  $('#download').disabled = !selected.size;
  $('#selection').replaceChildren();
  if (!selected.size) $('#selection').append(node('p', 'Noch keine Bedeutung ausgewählt.', 'selection-empty'));
  for (const [key, item] of selected) {
    const row = node('div', undefined, 'selected-item');
    const heading = node('div', undefined, 'selection-heading');
    heading.append(wordHeading(item), node('em', typeLabel(item), 'word-type'));
    row.append(heading, node('p', item.definition));
    if (item.example) row.append(node('p', item.example, 'example'));
    if (item.edited) {
      const original = node('details', undefined, 'entry-original');
      original.append(node('summary', 'Manuell bearbeitet · ursprüngliche Bedeutung'), node('p', item.originalDefinition));
      if (item.source) original.append(link('Quelle ↗', item.source));
      row.append(original);
    }
    if (item.origin === 'manual') {
      const provenance = node('p', 'Manuell hinzugefügt', 'hint');
      if (item.source) provenance.append(document.createTextNode(' · '), link('Quelle ↗', item.source));
      row.append(provenance);
    }
    if (item.plural.length) {
      const plural = node('div', 'Plural: ', 'selection-plural');
      appendForms(plural, item.plural, 'plural'); row.append(plural);
    }
    appendWordGrammar(row, item);
    appendGrammarEditor(row, item, key);
    const remove = node('button', 'Entfernen', 'text-button');
    remove.addEventListener('click', () => {
      undoItem = item; library.remove(key); grammarDrafts.delete(key);
      document.querySelectorAll('input[data-key]').forEach(input => { if (input.dataset.key === key) input.checked = false; });
      updateSelection();
    });
    row.append(remove); $('#selection').append(row);
  }
  document.querySelectorAll('input[data-key]').forEach(input => { input.checked = selected.has(input.dataset.key); });
  $('#undo-remove').hidden = !undoItem;
  $('#save-status').textContent = library.pending.size
    ? `${library.pending.size} Änderung(en) noch nicht in Google Sheets gespeichert.`
    : libraryId ? 'Mit dem zuletzt geladenen Stand abgeglichen.' : 'Verbinde Google Sheets, um deine Auswahl dauerhaft zu speichern.';
  setLibraryControls();
}

function renderEntries(word, raw, partsOfSpeech = []) {
  const entries = mapEntries(word, raw, partsOfSpeech);
  const container = $('#entries'); container.replaceChildren();
  if (!entries.length) container.append(node('p', 'Keine Einträge gefunden.'));
  entries.forEach(entry => {
    const article = node('article', undefined, 'dictionary-entry');
    const top = node('div', undefined, 'entry-top');
    top.append(wordHeading(entry, 'h3'), node('span', `${typeLabel(entry)} · ${entry.entryIndex + 1}`, 'pos'));
    article.append(top);
    if (entry.singular.length || entry.plural.length) {
      const grammar = node('div', undefined, 'grammar');
      for (const [title, forms, number] of [['SINGULAR', entry.singular, 'singular'], ['PLURAL', entry.plural, 'plural']]) {
        const field = node('div');
        const value = node('strong');
        if (forms.length) appendForms(value, forms, number);
        else value.textContent = 'Keine Angabe';
        field.append(node('span', title), value); grammar.append(field);
      }
      article.append(grammar);
      if (entry.plural.length > 1) article.append(node('p', 'Mehrere Formen im Eintrag. Die Zuordnung zu einzelnen Bedeutungen muss geprüft werden.', 'hint'));
    } else if (entry.pos === 'noun') article.append(node('p', 'Artikel und Plural: keine sicheren Angaben in diesem Eintrag.', 'hint'));
    appendWordGrammar(article, entry);
    if (!entry.senses.length) article.append(node('p', 'Keine ausformulierte Erklärung. Bitte auch die Grundform prüfen.', 'hint'));
    for (const sense of entry.senses) {
      const key = JSON.stringify([word, entry.entryIndex, sense.senseIndex, sense.definition]);
      const label = node('label', undefined, 'sense');
      const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.dataset.key = key; checkbox.checked = selected.has(key);
      const content = node('span'); content.append(node('span', sense.definition, 'definition'));
      if (sense.example) content.append(node('span', sense.example, 'example'));
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) library.put({ id: crypto.randomUUID(), word, entryIndex: entry.entryIndex, pos: entry.pos, possiblePartsOfSpeech: entry.possiblePartsOfSpeech, singular: entry.singular, plural: entry.plural, grammar: entry.grammar, grammarSource: entry.grammarSource, source: entry.source, ...sense });
        else { undoItem = selected.get(key); library.remove(key); grammarDrafts.delete(key); }
        updateSelection();
      });
      label.append(checkbox, content); article.append(label);
    }
    if (entry.baseWords.length) {
      const bases = node('div', 'Grundform: ', 'examples');
      entry.baseWords.forEach(base => { const button = node('button', base); button.addEventListener('click', () => search(base)); bases.append(button); });
      article.append(bases);
    }
    article.append(link('Original im Wiktionary ↗', entry.source)); container.append(article);
  });
}

function manualActions(word) {
  const actions = node('div', undefined, 'actions fallback-actions');
  const add = node('button', 'Bedeutung manuell hinzufügen', 'secondary');
  add.type = 'button';
  add.addEventListener('click', () => openManual(word));
  actions.append(link('Im Wiktionary suchen ↗', wiktionarySearchUrl(word)), add);
  return actions;
}
function reportLookupError(error, word) {
  status('#search-status', error.message, true);
  const notice = node('div', undefined, 'notice');
  notice.append(node('p', 'Ein fehlender Treffer beweist nicht, dass das Wort falsch ist. Bei Umlauten, ß oder Wortgruppen kann auch der Suchdienst die Ursache sein. Du kannst im Wiktionary nachschlagen und eine Bedeutung hier einfügen.'), manualActions(word));
  $('#entries').replaceChildren(notice);
}
async function choose(result, signal) {
  status('#search-status', `${result.word} wird geladen …`);
  try {
    const resolved = await dictionary.resolveResult(result, signal);
    if (signal.aborted) return;
    renderEntries(resolved.word, resolved.entries, resolved.partsOfSpeech);
    status('#search-status', resolved.resolvedFrom
      ? `„${resolved.resolvedFrom}“ ist eine getrennte Verbform. Grundform: ${resolved.word}. Wähle die passenden Bedeutungen.`
      : `${resolved.word}: Wähle die passenden Bedeutungen.`);
  } catch (error) { if (!signal.aborted) reportLookupError(error, result.word); }
}
async function search(query) {
  controller?.abort(); controller = new AbortController(); const signal = controller.signal;
  $('#query').value = query;
  $('#suggestions').replaceChildren(); $('#entries').replaceChildren(node('p', 'Wörterbuch wird durchsucht …', 'selection-empty'));
  status('#search-status', 'Suche läuft …');
  try {
    const results = await dictionary.searchWords(query, signal);
    if (signal.aborted) return;
    for (const result of results) {
      const button = node('button', undefined, 'suggestion');
      button.append(node('span', result.word), node('span', wordTypeLabel(result.partsOfSpeech), 'suggestion-type'));
      button.addEventListener('click', () => {
        controller?.abort(); controller = new AbortController(); choose(result, controller.signal);
      });
      $('#suggestions').append(button);
    }
    const exact = results.find(result => result.entries);
    if (exact) await choose(exact, signal);
    else {
      status('#search-status', results.length ? `${results.length} Treffer. Bitte ein Wort auswählen.` : 'In diesem Wörterbuch nicht gefunden.');
      $('#entries').replaceChildren(node('p', 'Wähle einen Treffer, versuche die Grundform oder füge eine Bedeutung manuell hinzu.', 'selection-empty'), manualActions(query));
    }
    if (!signal.aborted && results.warnings?.length) {
      $('#search-status').append(document.createTextNode(' Ein Teil der Suche ist fehlgeschlagen. ' + results.warnings.join(' ')));
    }
  } catch (error) { if (!signal.aborted) reportLookupError(error, query); }
}
$('#search-form').addEventListener('submit', event => { event.preventDefault(); search($('#query').value); });
function updateManualLookup() {
  $('#manual-lookup').href = wiktionarySearchUrl($('#manual-word').value);
}
function openManual(word) {
  if (!$('#manual-word').value.trim()) $('#manual-word').value = word.trim();
  $('#manual-details').open = true;
  updateManualLookup();
  $('#manual-word').focus();
}
$('#manual-details').addEventListener('toggle', () => {
  if ($('#manual-details').open && !$('#manual-word').value.trim()) {
    $('#manual-word').value = $('#query').value.trim(); updateManualLookup();
  }
});
$('#manual-word').addEventListener('input', updateManualLookup);
for (const pos of ['adj', 'verb']) appendGrammarFields($(`#manual-${pos}-fields`), pos, {}, `manual-${pos}`);
$('#manual-pos').addEventListener('change', () => {
  const isNoun = $('#manual-pos').value === 'noun';
  $('#manual-noun').hidden = !isNoun; $('#manual-noun').disabled = !isNoun;
  for (const pos of ['adj', 'verb']) {
    const fieldset = $(`#manual-${pos}`);
    fieldset.hidden = $('#manual-pos').value !== pos; fieldset.disabled = fieldset.hidden;
  }
});
$('#manual-form').addEventListener('input', () => { manualDirty = true; status('#manual-status', ''); });
$('#manual-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const entry = createManualEntry(Object.fromEntries(new FormData(event.currentTarget)));
    library.put(entry);
    updateSelection();
    $('#manual-definition').value = ''; $('#manual-example').value = ''; manualDirty = false;
    status('#manual-status', `${entry.word}: zur Auswahl hinzugefügt. Zum Aufbewahren in Google Sheets speichern. Du kannst eine weitere Bedeutung ergänzen.`);
    $('#manual-definition').focus();
  } catch (error) { status('#manual-status', error.message, true); }
});
document.querySelectorAll('[data-character]').forEach(button => {
  // Keep the caret/selection when a mouse or touch user presses a character.
  button.addEventListener('pointerdown', event => event.preventDefault());
  button.addEventListener('click', () => {
    const input = $('#query');
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const character = button.dataset.character;
    input.focus({ preventScroll: true });
    if (input.maxLength >= 0 && input.value.length - (end - start) + character.length > input.maxLength) {
      status('#search-status', `Bitte höchstens ${input.maxLength} Zeichen eingeben.`, true);
      return;
    }
    input.setRangeText(character, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
});
$('#download').addEventListener('click', () => {
  const content = { format: 'LearnGerman-selection', version: 1, exportedAt: new Date().toISOString(), meanings: [...selected.values()] };
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
  const anchor = node('a'); anchor.href = url; anchor.download = 'learngerman-auswahl.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('beforeunload', event => { if (library.pending.size || manualDirty || grammarDrafts.size || practice?.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; } });
$('#undo-remove').addEventListener('click', () => {
  if (undoItem) library.put(undoItem);
  undoItem = null; updateSelection();
});
$('#import-selection').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Bitte eine Auswahl-Datei unter 5 MB verwenden.');
    const data = JSON.parse(await file.text());
    if (data.format !== 'LearnGerman-selection' || data.version !== 1 || !Array.isArray(data.meanings)) throw new Error('Keine unterstützte LearnGerman-Auswahl.');
    data.meanings.forEach(validateMeaning);
    // Validate the entire file before changing anything; imports merge, never clear.
    for (const item of data.meanings) {
      const key = selectionKey(item);
      if (!selected.has(key)) library.put(item);
    }
    updateSelection(); status('#import-status', 'Auswahl ergänzt. Neue Bedeutungen bitte in Google Sheets speichern.');
  } catch (error) { status('#import-status', error.message, true); }
  event.target.value = '';
});

function loadGoogle() {
  if (!googleReady) googleReady = new Promise((resolve, reject) => {
    const script = node('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = resolve;
    script.onerror = () => { googleReady = null; script.remove(); reject(new Error('Google-Anmeldung konnte nicht geladen werden.')); };
    document.head.append(script);
  });
  return googleReady;
}
$('#connection-details').addEventListener('toggle', () => {
  if ($('#connection-details').open) loadGoogle().catch(error => status('#google-status', error.message, true));
});
function setGoogleControls(connected) {
  $('#create-sheet').disabled = !connected || Boolean(sheetId);
  $('#read-sheet').disabled = !connected || !sheetId;
  $('#disconnect').disabled = !connected;
  setLibraryControls();
}
function setLibraryControls() {
  const connected = sheets.isConnected();
  $('#create-library').disabled = googleBusy || !connected || Boolean(libraryId);
  $('#open-library').disabled = googleBusy || !connected;
  $('#load-library').disabled = googleBusy || !connected || !libraryId;
  $('#save-library').disabled = googleBusy || !connected || !libraryId || !library.pending.size;
  $('#library-url').disabled = googleBusy;
  $('#client-id').disabled = googleBusy;
  practice?.refresh();
}
function rememberConnection() {
  try {
    if ($('#remember-connection').checked) localStorage.setItem('learngerman-connection-v1', JSON.stringify({ clientId: $('#client-id').value.trim(), sheetUrl: $('#library-url').value.trim() }));
    else localStorage.removeItem('learngerman-connection-v1');
  } catch { status('#google-status', 'Der Browser konnte die Verbindungseinstellungen nicht merken.'); }
}
$('#remember-connection').addEventListener('change', rememberConnection);
try {
  const remembered = JSON.parse(localStorage.getItem('learngerman-connection-v1') || 'null');
  if (remembered && typeof remembered.clientId === 'string' && typeof remembered.sheetUrl === 'string') {
    $('#client-id').value = remembered.clientId; $('#library-url').value = remembered.sheetUrl; $('#remember-connection').checked = true;
  }
} catch { /* Storage may be disabled. Manual setup still works. */ }
function showLibrary(id) {
  libraryId = id;
  const url = `https://docs.google.com/spreadsheets/d/${id}/edit`;
  $('#library-url').value = url;
  $('#library-link').replaceChildren(link('Meine Vokabeltabelle öffnen ↗', url));
  rememberConnection();
}
async function libraryAction(message, action) {
  if (googleBusy) return;
  googleBusy = true; $('#connect').disabled = true;
  setGoogleControls(false); setLibraryControls(); status('#library-status', message);
  try { await action(); }
  catch (error) { status('#library-status', `${error.message} Deine lokalen Änderungen bleiben erhalten.`, true); }
  finally {
    googleBusy = false; $('#connect').disabled = false;
    setGoogleControls(sheets.isConnected()); updateSelection();
  }
}
$('#create-library').addEventListener('click', () => libraryAction('Vokabeltabelle wird erstellt …', async () => {
  const id = await sheets.createLibrarySheet();
  // Expose the returned ID immediately so a failed verification never hides the file.
  showLibrary(id);
  library.accept(await sheets.readLibrary(id));
  practice.setSheet(id, await sheets.readReviews(id));
  status('#library-status', 'Vokabeltabelle erstellt. Klicke jetzt auf „In Google Sheets speichern“, um deine Auswahl zu speichern.');
}));
$('#open-library').addEventListener('click', () => libraryAction('Vokabeltabelle wird geöffnet …', async () => {
  const id = parseSheetId($('#library-url').value);
  if (libraryId && id !== libraryId) throw new Error('Für eine andere Tabelle bitte zuerst speichern und die App neu öffnen.');
  let events;
  try { events = await sheets.readLibrary(id); }
  catch (error) {
    // Progress recovery stays available when the table is valid but a word row
    // is damaged. Keep the existing vocabulary untouched and report the row.
    await sheets.verifyLibrarySchema(id);
    showLibrary(id);
    practice.setSheet(id, await sheets.readReviews(id));
    throw new Error(`${error.message} Lernfortschritt kann weiterhin gespeichert werden; die Wortauswahl wurde nicht geladen.`);
  }
  library.accept(events); showLibrary(id);
  practice.setSheet(id, await sheets.readReviews(id));
  status('#library-status', 'Tabelle geladen. Noch ungespeicherte lokale Änderungen wurden beibehalten.');
}));
$('#load-library').addEventListener('click', () => libraryAction('Gespeicherte Auswahl wird geladen …', async () => {
  library.accept(await sheets.readLibrary(libraryId));
  practice.setSheet(libraryId, await sheets.readReviews(libraryId));
  status('#library-status', 'Aktueller Tabellenstand geladen. Lokale Änderungen bleiben zum Speichern vorgemerkt.');
}));
$('#save-library').addEventListener('click', () => libraryAction('Auswahl wird gespeichert und geprüft …', async () => {
  const changes = [...library.pending.values()];
  library.accept(await sheets.saveLibrary(libraryId, changes));
  status('#library-status', library.pending.size ? 'Gespeichert. Inzwischen hinzugefügte Änderungen bitte ebenfalls speichern.' : 'Gespeichert und aus Google Sheets zurückgelesen.');
}));
$('#connect').addEventListener('click', async () => {
  if (!globalThis.google?.accounts?.oauth2) { status('#google-status', 'Google wird geladen. Bitte danach erneut auf Verbinden klicken.'); loadGoogle().catch(error => status('#google-status', error.message, true)); return; }
  $('#connect').disabled = true; setGoogleControls(false);
  googleBusy = true; setLibraryControls();
  try {
    await sheets.authorize($('#client-id').value.trim());
    rememberConnection(); status('#google-status', 'Verbunden. Öffne deine Vokabeltabelle oder erstelle einmalig eine neue.');
  } catch (error) { status('#google-status', error.message, true); }
  finally { googleBusy = false; $('#connect').disabled = false; setGoogleControls(sheets.isConnected()); }
});
$('#create-sheet').addEventListener('click', async () => {
  googleBusy = true;
  setGoogleControls(false); $('#connect').disabled = true; status('#google-status', 'Private Testtabelle wird erstellt …');
  try {
    sheetId = await sheets.createTestSheet();
    $('#sheet-link').replaceChildren(link('Testtabelle in Google Sheets öffnen ↗', `https://docs.google.com/spreadsheets/d/${sheetId}/edit`));
    await sheets.verifyTestSheet(sheetId);
    status('#google-status', 'Erfolgreich: Beispielwort gespeichert und aus Google Sheets zurückgelesen.');
  } catch (error) { status('#google-status', error.message, true); }
  finally { googleBusy = false; setGoogleControls(sheets.isConnected()); $('#connect').disabled = false; }
});
$('#read-sheet').addEventListener('click', async () => {
  googleBusy = true; setGoogleControls(false); $('#connect').disabled = true;
  try { await sheets.verifyTestSheet(sheetId); status('#google-status', 'Die Testzeile wurde erfolgreich gelesen.'); }
  catch (error) { status('#google-status', error.message, true); }
  finally { googleBusy = false; setGoogleControls(sheets.isConnected()); $('#connect').disabled = false; }
});
$('#disconnect').addEventListener('click', () => { sheets.disconnect(); setGoogleControls(false); status('#google-status', 'Verbindung getrennt. Die Testtabelle bleibt in deinem Google Drive.'); });
async function practiceRequest(work) {
  if (googleBusy) throw new Error('Bitte warte, bis die aktuelle Google-Anfrage beendet ist.');
  if (!libraryId) throw new Error('Bitte zuerst deine Vokabeltabelle öffnen.');
  googleBusy = true; $('#connect').disabled = true; setGoogleControls(false);
  try { return await work(libraryId); }
  finally { googleBusy = false; $('#connect').disabled = false; setGoogleControls(sheets.isConnected()); }
}
practice = createPracticeUI({
  getEntries: () => [...selected.values()],
  context: () => ({ id: libraryId, connected: sheets.isConnected(), busy: googleBusy, pendingVocabulary: library.pending.size }),
  saveReviews: events => practiceRequest(id => sheets.saveReviews(id, events)),
  reloadReviews: () => practiceRequest(id => sheets.readReviews(id)),
  wordHeading, appendForms, appendWordGrammar,
});
updateSelection();
