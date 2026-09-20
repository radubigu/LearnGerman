import { createDictionary, mapEntries, wordTypeLabel, nounColor } from './dictionary.js';
import { createSheetsClient } from './sheets.js';
import { createManualEntry, wiktionarySearchUrl } from './manual-entry.js';
import { createLibrary, parseSheetId, validateMeaning, selectionKey } from './library.js';
import { GRAMMAR_FIELDS } from './grammar.js';
import { createPracticeUI } from './practice-ui.js';
import { editMeaning } from './edit-entry.js';
import { parseWordList } from './word-list.js';
import { deeplTranslationUrl } from './translation.js';

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
let bulkQueue = [];
let bulkIndex = -1;
let parsedWords;
let activeEnglishHint = '';
let bulkBusy = false;
let activeQueueContext = null;
let startBaseListWhenReady = false;
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
function link(text, url) { const element = node('a', text); element.href = url; element.target = '_blank'; element.rel = 'noreferrer'; return element; }
function openTranslationPopup(event) {
  const width = 520;
  const height = 680;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const popup = window.open(event.currentTarget.href, 'learngerman-deepl', `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
  // If the browser blocks popups, keep the anchor's normal new-tab fallback.
  if (!popup) return;
  event.preventDefault();
  try { popup.opener = null; popup.focus(); } catch { /* Cross-origin window controls may be restricted. */ }
}
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

function showEnglishHint(englishHint = '') {
  activeEnglishHint = englishHint.trim();
  const hint = $('#import-meaning-hint');
  hint.hidden = !activeEnglishHint;
  hint.replaceChildren();
  if (activeEnglishHint) hint.append(node('strong', 'Englischer Hinweis aus der Importliste'), node('p', activeEnglishHint));
}

function updateSelection() {
  reconcileImportCandidates();
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
  const pendingImportStatuses = bulkQueue.filter(item => item.statusPending === 'added').length;
  $('#save-status').textContent = library.pending.size
    ? `${library.pending.size} Änderung(en) noch nicht in Google Sheets gespeichert.${pendingImportStatuses ? ` ${pendingImportStatuses} Importmarkierung(en) werden danach als added gespeichert.` : ''}`
    : pendingImportStatuses
      ? `${pendingImportStatuses} Importmarkierung(en) noch nicht als added gespeichert.`
      : libraryId ? 'Mit dem zuletzt geladenen Stand abgeglichen.' : 'Verbinde Google Sheets, um deine Auswahl dauerhaft zu speichern.';
  setLibraryControls();
}

function renderEntries(word, raw, partsOfSpeech = [], queueItem = null) {
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
      if (queueItem) {
        queueItem.meaningKeys ??= new Set();
        queueItem.meaningKeys.add(key);
      }
      const senseRow = node('div', undefined, 'sense-row');
      const meaning = node('div', undefined, 'sense');
      const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.dataset.key = key; checkbox.checked = selected.has(key);
      checkbox.setAttribute('aria-label', `Bedeutung auswählen: ${sense.definition}`);
      const content = node('span'); content.append(node('span', sense.definition, 'definition'));
      if (sense.example) content.append(node('span', sense.example, 'example'));
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) library.put({ id: crypto.randomUUID(), word, entryIndex: entry.entryIndex, pos: entry.pos, possiblePartsOfSpeech: entry.possiblePartsOfSpeech, singular: entry.singular, plural: entry.plural, grammar: entry.grammar, grammarSource: entry.grammarSource, source: entry.source, ...sense });
        else { undoItem = selected.get(key); library.remove(key); grammarDrafts.delete(key); }
        updateSelection();
      });
      const translate = link('EN', deeplTranslationUrl(sense.definition));
      translate.className = 'definition-translation';
      translate.setAttribute('aria-label', 'Diese Definition mit DeepL ins Englische übersetzen');
      translate.title = 'Die Definition in einem kleinen DeepL-Fenster öffnen.';
      translate.addEventListener('click', openTranslationPopup);
      meaning.append(checkbox, content); senseRow.append(translate, meaning); article.append(senseRow);
    }
    if (entry.baseWords.length) {
      const bases = node('div', 'Grundform: ', 'examples');
      entry.baseWords.forEach(base => { const button = node('button', base); button.addEventListener('click', () => search(base, activeEnglishHint, queueItem)); bases.append(button); });
      article.append(bases);
    }
    article.append(link('Original im Wiktionary ↗', entry.source)); container.append(article);
  });
  if (queueItem) updateSelection();
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
async function choose(result, signal, queueItem = null) {
  status('#search-status', `${result.word} wird geladen …`);
  try {
    const resolved = await dictionary.resolveResult(result, signal);
    if (signal.aborted) return;
    renderEntries(resolved.word, resolved.entries, resolved.partsOfSpeech, queueItem);
    status('#search-status', resolved.resolvedFrom
      ? `„${resolved.resolvedFrom}“ ist eine getrennte Verbform. Grundform: ${resolved.word}. Wähle die passenden Bedeutungen.`
      : `${resolved.word}: Wähle die passenden Bedeutungen.`);
  } catch (error) { if (!signal.aborted) reportLookupError(error, result.word); }
}
async function search(query, englishHint = '', queueItem = null) {
  controller?.abort(); controller = new AbortController(); const signal = controller.signal;
  activeQueueContext = queueItem;
  showEnglishHint(englishHint);
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
        controller?.abort(); controller = new AbortController(); choose(result, controller.signal, queueItem);
      });
      $('#suggestions').append(button);
    }
    const exact = results.find(result => result.entries);
    if (exact) await choose(exact, signal, queueItem);
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
function renderBulkQueue() {
  const active = bulkQueue[bulkIndex];
  const finished = bulkQueue.filter(item => item.state === 'done').length;
  const skipped = bulkQueue.filter(item => item.state === 'skipped').length;
  const pendingAdded = bulkQueue.filter(item => item.statusPending === 'added').length;
  $('#bulk-review').hidden = !bulkQueue.length;
  $('#bulk-bottom-actions').hidden = !active;
  $('#bulk-next').disabled = !active || bulkBusy;
  $('#bulk-skip').disabled = !active || bulkBusy;
  $('#bulk-bottom-next').disabled = !active || bulkBusy;
  $('#bulk-bottom-skip').disabled = !active || bulkBusy;
  $('#bulk-review-status').textContent = active
    ? `Wort ${bulkIndex + 1} von ${bulkQueue.length}: „${active.word}“. Wähle eine oder mehrere Bedeutungen und gehe dann weiter. ${finished} durchgesehen, ${skipped} übersprungen.`
    : bulkQueue.some(item => item.state === 'open')
      ? `${bulkQueue.filter(item => item.state === 'open').length} Wörter sind offen. Wähle ein Wort aus der Liste.`
      : `Liste durchgesehen: ${finished} durchgesehen, ${skipped} übersprungen${pendingAdded ? `, ${pendingAdded} als added vorgemerkt` : ''}. Ausgewählte Bedeutungen in „Meine Auswahl“ speichern.`;
  $('#bulk-bottom-status').textContent = active ? `Listenwort ${bulkIndex + 1} von ${bulkQueue.length}: ${active.word}` : '';
  const list = $('#bulk-queue'); list.replaceChildren();
  bulkQueue.forEach((item, index) => {
    const row = node('li');
    if (index === bulkIndex) row.classList.add('current');
    if (item.state === 'done' || item.status === 'added' || item.statusPending === 'added') row.classList.add('done');
    if (item.state === 'skipped' || item.status === 'skipped') row.classList.add('skipped');
    const button = node('button', item.word); button.type = 'button';
    const stateLabel = item.status === 'added' ? 'hinzugefügt'
      : item.status === 'skipped' || item.state === 'skipped' ? 'übersprungen'
        : item.statusPending === 'added' ? 'zum Speichern ausgewählt'
          : index === bulkIndex ? 'aktuell' : item.state === 'done' ? 'durchgesehen' : 'offen';
    button.setAttribute('aria-label', `${item.word}, ${stateLabel}`);
    if (index === bulkIndex) button.setAttribute('aria-current', 'step');
    button.addEventListener('click', () => openBulkWord(index));
    row.append(button);
    if (item.englishHint) row.append(document.createTextNode(' — '), node('span', item.englishHint, 'queue-hint'));
    list.append(row);
  });
}
function openBulkWord(index) {
  bulkIndex = index;
  bulkQueue[index].state = 'open';
  const { word, englishHint } = bulkQueue[index];
  if (!manualDirty) {
    $('#manual-form').reset();
    $('#manual-pos').dispatchEvent(new Event('change'));
    $('#manual-word').value = word;
    updateManualLookup();
    status('#manual-status', '');
  } else status('#manual-status', 'Dein offener manueller Entwurf bleibt erhalten. Prüfe vor dem Hinzufügen das Feld „Wort / Grundform“.');
  renderBulkQueue();
  search(word, englishHint, bulkQueue[index]);
  $('#search-form').scrollIntoView({ block: 'start' });
}
function itemHasSelectedMeaning(item) {
  return [...(item.meaningKeys ?? [])].some(key => selected.has(key));
}
function reconcileImportCandidates() {
  for (const item of bulkQueue) {
    if (item.source !== 'sheet' || item.status) continue;
    if (itemHasSelectedMeaning(item)) item.statusPending = 'added';
    else if (item.statusPending === 'added') {
      delete item.statusPending;
      if (item.state === 'done') item.state = 'open';
    }
  }
}
async function advanceBulk(skip) {
  if (bulkIndex < 0 || bulkBusy) return;
  const item = bulkQueue[bulkIndex];
  if (item.source === 'sheet' && !skip && !itemHasSelectedMeaning(item)) {
    status('#baselist-status', 'Wähle oder erstelle zuerst mindestens eine Bedeutung. Wenn du das Wort bereits kennst, verwende „Überspringen“.', true);
    return;
  }
  if (item.source === 'sheet' && skip && itemHasSelectedMeaning(item)) {
    status('#baselist-status', 'Für dieses Wort ist eine Bedeutung ausgewählt. Verwende „Fertig, nächstes Wort“ oder entferne die Auswahl, bevor du es überspringst.', true);
    return;
  }
  if (item.source === 'sheet' && skip) {
    if (!libraryId || !sheets.isConnected()) {
      status('#baselist-status', 'Bitte Google erneut verbinden und die Vokabeltabelle öffnen.', true);
      return;
    }
    bulkBusy = true; renderBulkQueue(); setLibraryControls();
    try {
      await sheets.saveImportStatuses(libraryId, [{ ...item, status: 'skipped' }]);
      item.status = 'skipped';
      status('#baselist-status', `„${item.word}“ wurde als skipped markiert.`);
    } catch (error) {
      status('#baselist-status', error.message, true);
      bulkBusy = false; renderBulkQueue(); setLibraryControls();
      return;
    }
    bulkBusy = false;
    setLibraryControls();
  }
  item.state = skip ? 'skipped' : 'done';
  if (item.source === 'sheet' && !skip) {
    status('#baselist-status', `„${item.word}“ wird als added markiert, sobald die Auswahl in Google Sheets gespeichert ist.`);
  }
  const next = [...bulkQueue.keys()].find(index => index > bulkIndex && bulkQueue[index].state === 'open')
    ?? bulkQueue.findIndex(item => item.state === 'open');
  if (next < 0) { bulkIndex = -1; renderBulkQueue(); $('#bulk-details').scrollIntoView({ block: 'start' }); }
  else openBulkWord(next);
}
function importStatusSummary(result) {
  return `${result.pending.length} offen, ${result.added} hinzugefügt, ${result.skipped} übersprungen.`;
}
function applyImportBaseList(result, start = false) {
  const shouldStart = start || startBaseListWhenReady;
  startBaseListWhenReady = false;
  const current = bulkQueue[bulkIndex];
  const prior = new Map(bulkQueue.filter(item => item.source === 'sheet').map(item => [item.rowNumber, item]));
  const manualItems = bulkQueue.filter(item => item.source !== 'sheet');
  const sheetItems = result.pending.map(item => {
    const existing = prior.get(item.rowNumber);
    return existing && existing.word === item.word && existing.englishHint === item.englishHint
      ? { ...item, source: 'sheet', state: existing.state, meaningKeys: existing.meaningKeys, statusPending: existing.statusPending }
      : { ...item, source: 'sheet', state: 'open', meaningKeys: new Set() };
  });
  for (const existing of prior.values()) {
    if (existing.statusPending && !sheetItems.some(item => item.rowNumber === existing.rowNumber)) sheetItems.push(existing);
  }
  bulkQueue = [...manualItems, ...sheetItems];
  bulkIndex = current ? bulkQueue.findIndex(item => item === current || (item.source === current.source && item.rowNumber === current.rowNumber)) : -1;
  if (bulkIndex < 0 && shouldStart) bulkIndex = bulkQueue.findIndex(item => item.state === 'open');
  renderBulkQueue();
  if (shouldStart && bulkIndex >= 0) openBulkWord(bulkIndex);
  status('#baselist-status', `import_baselist geladen: ${importStatusSummary(result)}`);
}
async function readImportBaseList(start = false) {
  if (!libraryId) throw new Error('Bitte zuerst deine Vokabeltabelle öffnen.');
  const result = await sheets.readImportBaseList(libraryId);
  applyImportBaseList(result, start);
  return result;
}
function clearBulkPreview() {
  parsedWords = undefined;
  $('#bulk-preview').hidden = true;
  status('#bulk-parse-status', '');
}
$('#bulk-text').addEventListener('input', clearBulkPreview);
$('#bulk-mode').addEventListener('change', clearBulkPreview);
$('#bulk-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 256 * 1024) throw new Error('Bitte eine Textdatei unter 256 KB verwenden.');
    $('#bulk-text').value = await file.text();
    clearBulkPreview();
    status('#bulk-parse-status', `${file.name} geladen. Prüfe den Text und die Trennzeichen.`);
  } catch (error) { status('#bulk-parse-status', error.message, true); }
  event.target.value = '';
});
$('#bulk-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    parsedWords = parseWordList($('#bulk-text').value, $('#bulk-mode').value);
    $('#bulk-preview-list').replaceChildren(...parsedWords.items.map(item => {
      const row = node('li'); row.append(node('strong', item.word));
      if (item.englishHint) row.append(document.createTextNode(' — '), node('span', item.englishHint, 'queue-hint'));
      return row;
    }));
    $('#bulk-preview-count').textContent = `${parsedWords.words.length} ${parsedWords.words.length === 1 ? 'Wort' : 'Wörter'} erkannt${parsedWords.duplicates ? `, ${parsedWords.duplicates} ${parsedWords.duplicates === 1 ? 'doppelter Eintrag' : 'doppelte Einträge'} entfernt` : ''}. Prüfe die Liste vor dem Start.`;
    $('#bulk-preview').hidden = false;
    status('#bulk-parse-status', '');
  } catch (error) { clearBulkPreview(); status('#bulk-parse-status', error.message, true); }
});
$('#bulk-add').addEventListener('click', () => {
  if (!parsedWords) return;
  const existing = new Set(bulkQueue.map(item => item.word));
  const added = parsedWords.items.filter(item => !existing.has(item.word));
  if (!added.length) { status('#bulk-parse-status', 'Alle Wörter stehen bereits in der Prüfliste.'); return; }
  bulkQueue.push(...added.map(item => ({ ...item, state: 'open' })));
  $('#bulk-preview').hidden = true;
  parsedWords = undefined;
  status('#bulk-parse-status', `${added.length} ${added.length === 1 ? 'Wort' : 'Wörter'} zur Prüfliste hinzugefügt.`);
  if (bulkIndex < 0) openBulkWord(bulkQueue.length - added.length);
  else renderBulkQueue();
});
for (const id of ['bulk-next', 'bulk-bottom-next']) $(`#${id}`).addEventListener('click', () => advanceBulk(false));
for (const id of ['bulk-skip', 'bulk-bottom-skip']) $(`#${id}`).addEventListener('click', () => advanceBulk(true));
function updateManualLookup() {
  $('#manual-lookup').href = wiktionarySearchUrl($('#manual-word').value);
}
function openManual(word) {
  if (!manualDirty) $('#manual-word').value = word.trim();
  else if ($('#manual-word').value.trim() !== word.trim()) status('#manual-status', 'Dein offener manueller Entwurf bleibt erhalten. Prüfe vor dem Hinzufügen das Feld „Wort / Grundform“.');
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
    const activeQueueItem = activeQueueContext;
    if (activeQueueItem) {
      activeQueueItem.meaningKeys ??= new Set();
      activeQueueItem.meaningKeys.add(selectionKey(entry));
    }
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
window.addEventListener('beforeunload', event => { if (library.pending.size || manualDirty || grammarDrafts.size || bulkQueue.some(item => item.state === 'open') || practice?.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; } });
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
  const pendingImportStatuses = bulkQueue.some(item => item.statusPending === 'added');
  $('#save-library').disabled = googleBusy || bulkBusy || !connected || !libraryId || (!library.pending.size && !pendingImportStatuses);
  // Keep this touch target available once the Sheet itself is known. On a
  // slower phone, review/import reads may still be finishing in the background;
  // the click handler queues the requested start instead of appearing broken.
  $('#load-baselist').disabled = bulkBusy || !libraryId;
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
  setLibraryControls();
}
$('#load-baselist').addEventListener('click', () => {
  const openIndex = bulkQueue.findIndex(item => item.source === 'sheet' && item.state === 'open');
  if (openIndex >= 0) {
    openBulkWord(openIndex);
    return;
  }
  if (googleBusy) {
    startBaseListWhenReady = true;
    status('#baselist-status', 'Die Tabelle wird noch fertig geladen. Die Wortliste startet danach automatisch.');
    return;
  }
  if (!sheets.isConnected()) {
    status('#baselist-status', 'Bitte Google erneut verbinden und die Vokabeltabelle öffnen.', true);
    return;
  }
  libraryAction('Importliste wird geladen …', async () => { await readImportBaseList(true); });
});
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
  try { await readImportBaseList(); } catch (error) { status('#baselist-status', error.message, true); }
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
  try { await readImportBaseList(); } catch (error) { status('#baselist-status', error.message, true); }
  status('#library-status', 'Tabelle geladen. Noch ungespeicherte lokale Änderungen wurden beibehalten.');
}));
$('#load-library').addEventListener('click', () => libraryAction('Gespeicherte Auswahl wird geladen …', async () => {
  library.accept(await sheets.readLibrary(libraryId));
  practice.setSheet(libraryId, await sheets.readReviews(libraryId));
  try { await readImportBaseList(); } catch (error) { status('#baselist-status', error.message, true); }
  status('#library-status', 'Aktueller Tabellenstand geladen. Lokale Änderungen bleiben zum Speichern vorgemerkt.');
}));
$('#save-library').addEventListener('click', () => libraryAction('Auswahl wird gespeichert und geprüft …', async () => {
  const pendingItems = bulkQueue.filter(item => item.statusPending === 'added');
  const invalid = pendingItems.filter(item => !itemHasSelectedMeaning(item));
  for (const item of invalid) { delete item.statusPending; item.state = 'open'; }
  if (invalid.length) {
    renderBulkQueue();
    throw new Error('Mindestens eine Importbedeutung wurde vor dem Speichern wieder entfernt. Das Wort bleibt in import_baselist offen.');
  }
  const changes = [...library.pending.values()];
  if (changes.length) library.accept(await sheets.saveLibrary(libraryId, changes));
  const validItems = pendingItems.filter(item => itemHasSelectedMeaning(item));
  if (validItems.length) {
    await sheets.saveImportStatuses(libraryId, validItems.map(item => ({ ...item, status: 'added' })));
    const completedCurrent = validItems.includes(bulkQueue[bulkIndex]);
    for (const item of validItems) {
      delete item.statusPending;
      item.status = 'added';
      item.state = 'done';
    }
    if (completedCurrent) {
      bulkIndex = -1;
      activeQueueContext = null;
    }
    renderBulkQueue();
    status('#baselist-status', `${validItems.length} ${validItems.length === 1 ? 'Zeile wurde' : 'Zeilen wurden'} als added markiert.`);
  }
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
