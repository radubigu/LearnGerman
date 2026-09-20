const MAX_WORDS = 100;
const MAX_LENGTH = 150;
const MAX_HINT_LENGTH = 1000;

function validateItem(wordValue, englishHintValue = '') {
  const word = wordValue.trim();
  const englishHint = englishHintValue.trim();
  if (!word) throw new Error('Bitte mindestens ein Wort eingeben.');
  if (word.length > MAX_LENGTH) throw new Error(`„${word.slice(0, 30)}…“ ist länger als ${MAX_LENGTH} Zeichen.`);
  if (englishHint.length > MAX_HINT_LENGTH) throw new Error(`Der englische Hinweis für „${word}“ ist länger als ${MAX_HINT_LENGTH} Zeichen.`);
  return { word, englishHint };
}

function parseRows(text, delimiter) {
  const rows = [];
  let row = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { current += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      row.push(current); current = '';
    } else if (!quoted && (character === '\r' || character === '\n')) {
      row.push(current); current = '';
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
      if (character === '\r' && text[index + 1] === '\n') index++;
    } else current += character;
  }
  if (quoted) throw new Error('Ein Anführungszeichen in der Liste ist nicht geschlossen.');
  row.push(current);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

function isHeader(row) {
  const first = row[0]?.trim().toLocaleLowerCase('de-DE');
  const second = row[1]?.trim().toLocaleLowerCase('en');
  return ['deutsch', 'german', 'wort', 'word'].includes(first)
    && ['englisch', 'english', 'bedeutung', 'meaning', 'übersetzung', 'translation'].includes(second);
}

function parseColumns(text) {
  const firstLine = text.split(/\r?\n/u).find(line => line.trim()) ?? '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  const rows = parseRows(text, delimiter);
  if (rows.length && isHeader(rows[0])) rows.shift();
  if (!rows.length) throw new Error('Bitte mindestens ein Wort eingeben.');
  return rows.map((row, index) => {
    if (row.length !== 2 || !row[0].trim() || !row[1].trim()) {
      throw new Error(`Zeile ${index + 1} braucht genau zwei ausgefüllte Spalten: Deutsch und Englisch. Verwende bei Kommas im englischen Text Tabulatoren oder CSV-Anführungszeichen.`);
    }
    return validateItem(row[0], row[1]);
  });
}

export function parseWordList(input, mode = 'auto') {
  if (!['auto', 'lines', 'columns'].includes(mode)) throw new Error('Unbekanntes Trennzeichenformat.');
  const text = String(input).normalize('NFC');
  if (text.length > 100000) throw new Error('Die Wortliste ist zu lang. Bitte eine kürzere Liste einfügen.');
  const rawItems = mode === 'columns' ? parseColumns(text) : undefined;
  const separators = mode === 'lines' ? '\r\n' : '\r\n,;\t';
  const parts = [];
  let current = '';
  let quoted = false;
  if (!rawItems) {
    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      if (mode === 'auto' && character === '"') {
        if (quoted && text[i + 1] === '"') { current += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && separators.includes(character)) {
        parts.push(current); current = '';
      } else current += character;
    }
    if (quoted) throw new Error('Ein Anführungszeichen in der Liste ist nicht geschlossen.');
    parts.push(current);
  }
  const items = [];
  const seen = new Set();
  let duplicates = 0;
  for (const candidate of rawItems ?? parts.filter(part => part.trim()).map(part => validateItem(part))) {
    if (seen.has(candidate.word)) { duplicates++; continue; }
    seen.add(candidate.word); items.push(candidate);
    if (items.length > MAX_WORDS) throw new Error(`Bitte höchstens ${MAX_WORDS} Wörter auf einmal bearbeiten.`);
  }
  if (!items.length) throw new Error('Bitte mindestens ein Wort eingeben.');
  return { words: items.map(item => item.word), items, duplicates };
}
