import { selectionKey, validateMeaning } from './library.js';
import { GRAMMAR_FIELDS } from './grammar.js';

export const REVIEW_TAB = 'LearnGerman_Review_V1';
export const REVIEW_HEADER = ['LearnGerman practice v1', 'Ergebnis JSON'];
const DAY = 86400000;
const INTERVALS = [1, 3, 7, 14, 30, 60];
const DIMENSIONS = ['meaning', 'article', 'plural', 'comparative', 'superlative', 'preterite', 'participleII', 'auxiliary'];
const unique = values => [...new Set(values)];
export const normalizeAnswer = value => String(value).normalize('NFC').trim().replace(/\s+/gu, ' ');
const bareNoun = value => value.replace(/^(der|die|das)\s+/u, '');
export function mergeReviews(...collections) {
  const byId = new Map();
  for (const event of collections.flat()) {
    if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.id !== 'string' || !event.id || typeof event.sessionId !== 'string' || !event.sessionId ||
      typeof event.questionKey !== 'string' || !/^[a-f0-9]{64}$/u.test(event.questionKey) || !DIMENSIONS.includes(event.dimension) ||
      !['choice', 'type', 'self'].includes(event.mode) || typeof event.correct !== 'boolean' || !Number.isSafeInteger(event.at) || event.at < 0 || event.at > 8640000000000000) throw new Error('Ungültiger Lernfortschritt.');
    const normalized = { id: event.id, sessionId: event.sessionId, questionKey: event.questionKey, dimension: event.dimension, mode: event.mode, correct: event.correct, at: event.at };
    if (byId.has(event.id) && JSON.stringify(byId.get(event.id)) !== JSON.stringify(normalized)) throw new Error('Widersprüchliche doppelte Übungs-ID.');
    byId.set(event.id, normalized);
  }
  return [...byId.values()];
}
export const reviewRows = events => mergeReviews(events).map(event => [event.id, JSON.stringify(event)]);
export function parseReviews(rows) {
  if (!Array.isArray(rows) || JSON.stringify(rows[0]) !== JSON.stringify(REVIEW_HEADER)) throw new Error('Unbekanntes Format des Lernfortschritts.');
  return mergeReviews(rows.slice(1).map(row => {
    if (!Array.isArray(row) || row.length !== 2) throw new Error('Beschädigte Übungszeile.');
    let event;
    try { event = JSON.parse(row[1]); } catch { throw new Error('Unlesbarer Lernfortschritt.'); }
    if (event?.id !== row[0]) throw new Error('Widersprüchliche Übungs-ID.');
    return event;
  }));
}
export function reviewState(events) {
  const sessions = new Map();
  for (const event of mergeReviews(events)) {
    const key = JSON.stringify([event.sessionId, event.questionKey]);
    const previous = sessions.get(key);
    sessions.set(key, { key: event.questionKey, id: key, correct: event.correct && (previous?.correct ?? true), at: Math.max(event.at, previous?.at ?? 0) });
  }
  const state = new Map();
  for (const result of [...sessions.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))) {
    const previous = state.get(result.key);
    if (!result.correct) state.set(result.key, { streak: 0, dueAt: result.at + 600000 });
    // Extra practice before a scheduled review cannot accelerate promotion.
    else if (!previous || result.at >= previous.dueAt) {
      const streak = Math.min((previous?.streak ?? 0) + 1, INTERVALS.length);
      state.set(result.key, { streak, dueAt: result.at + INTERVALS[streak - 1] * DAY });
    }
  }
  return state;
}
async function questionHash(entry, dimension, answers) {
  const identity = [selectionKey(entry), dimension, [...answers].sort()];
  if (dimension === 'meaning' && entry.originalDefinition !== undefined && entry.definition !== entry.originalDefinition) identity.push(entry.definition);
  const data = new TextEncoder().encode(JSON.stringify(identity));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function wordLabel(entry) { return entry.singular[0] ?? entry.plural[0] ?? entry.word; }
export async function practiceQuestions(entries) {
  entries.forEach(validateMeaning);
  return Promise.all(entries.map(async entry => {
    const sameMeaning = entries.filter(other => normalizeAnswer(other.definition) === normalizeAnswer(entry.definition));
    const definitions = [{ dimension: 'meaning', prompt: entry.definition,
      answers: unique(sameMeaning.flatMap(other => [other.word, ...other.singular, ...other.plural.filter(() => !other.singular.length)])),
      noun: entry.pos === 'noun', instruction: 'Welches Wort passt? Schreibe das Wort.' }];
    if (entry.pos === 'noun') {
      const articles = unique(entry.singular.map(form => /^(der|die|das)\s/u.exec(form)?.[1]).filter(Boolean));
      if (articles.length && articles.length < 3) definitions.push({ dimension: 'article', prompt: entry.word, answers: articles, instruction: 'Welcher Artikel gehört zum Singular?', choices: ['der', 'die', 'das'] });
      if (entry.singular.length && entry.plural.length) definitions.push({ dimension: 'plural', prompt: wordLabel(entry), answers: unique(entry.plural.flatMap(form => [form, bareNoun(form)])), noun: true, instruction: 'Wie lautet der Plural? Mit oder ohne Artikel.' });
    }
    for (const [dimension, label] of GRAMMAR_FIELDS[entry.pos] ?? []) {
      if (entry.grammar?.[dimension]?.length) definitions.push({ dimension, prompt: entry.word, answers: entry.grammar[dimension], instruction: `${label}: Ergänze die gespeicherte Form.`, choices: dimension === 'auxiliary' && entry.grammar[dimension].length === 1 ? ['haben', 'sein'] : undefined });
    }
    const questions = await Promise.all(definitions.map(async question => ({ ...question, entry, questionKey: await questionHash(entry, question.dimension, question.answers) })));
    return { entry, questions };
  }));
}

export async function progressOverview(entries, events, now = Date.now()) {
  const cards = await practiceQuestions(entries), state = reviewState(events);
  const rows = cards.map(card => {
    const skills = card.questions.map(question => {
      const progress = state.get(question.questionKey);
      return { dimension: question.dimension, questionKey: question.questionKey, stage: !progress ? 'new' : progress.streak === 0 ? 'retry' : progress.streak >= 3 ? 'established' : 'learning', dueAt: progress?.dueAt ?? null, due: Boolean(progress && progress.dueAt <= now) };
    });
    return { entry: card.entry, skills };
  });
  const counts = skills => ({ total: skills.length, new: skills.filter(skill => skill.stage === 'new').length, due: skills.filter(skill => skill.due).length, established: skills.filter(skill => skill.stage === 'established').length, learning: skills.filter(skill => ['learning', 'retry'].includes(skill.stage)).length });
  return { rows, newMeanings: rows.filter(row => row.skills[0].stage === 'new').length,
    dueMeanings: rows.filter(row => row.skills.some(skill => skill.due)).length,
    meaning: counts(rows.map(row => row.skills[0])), grammar: counts(rows.flatMap(row => row.skills.slice(1))),
    nextDue: rows.flatMap(row => row.skills).map(skill => skill.dueAt).filter(time => time > now).sort((a, b) => a - b)[0] ?? null };
}

export function roundSummary(session) {
  const attempts = mergeReviews(session.results), groups = new Map();
  for (const result of attempts) {
    const current = groups.get(result.questionKey) ?? { question: session.questions.find(question => question.questionKey === result.questionKey), correct: true, attempts: 0 };
    current.correct &&= result.correct; current.attempts++;
    groups.set(result.questionKey, current);
  }
  const skills = [...groups.values()];
  return { answers: attempts.length, correctAnswers: attempts.filter(result => result.correct).length, skills: skills.length,
    correctSkills: skills.filter(skill => skill.correct).length, needsPractice: skills.filter(skill => !skill.correct) };
}
function shuffled(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1)); [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
export async function planSession(entries, reviews, { now = Date.now(), limit = 5, force = false, random = Math.random } = {}) {
  const cards = await practiceQuestions(entries), state = reviewState(reviews);
  const due = question => state.get(question.questionKey)?.dueAt ?? 0;
  const eligible = shuffled(cards, random).filter(card => force || card.questions.some(question => due(question) <= now));
  eligible.sort((a, b) => {
    // Previously learned items that are due are reviewed before brand-new words.
    const priority = card => card.questions.some(question => state.has(question.questionKey) && due(question) <= now) ? 0 : 1;
    return priority(a) - priority(b);
  });
  const chosen = eligible.slice(0, limit);
  const learning = [], recognition = [], recall = [], grammar = [];
  const question = (base, mode, extra = {}) => ({ ...structuredClone(base), id: crypto.randomUUID(), mode, ...extra });
  for (const card of chosen) {
    const meaning = card.questions[0];
    const current = state.get(meaning.questionKey);
    if (force || due(meaning) <= now) {
      if (!current || current.streak === 0) {
        learning.push(question(meaning, 'learn'));
        const wrong = shuffled(cards.filter(other => !meaning.answers.includes(other.entry.word) && normalizeAnswer(other.entry.definition) !== normalizeAnswer(card.entry.definition)), random);
        const options = [{ value: card.entry.word, label: wordLabel(card.entry), nounNumber: card.entry.singular.length ? 'singular' : 'plural' }];
        for (const other of wrong) {
          if (!options.some(option => option.value === other.entry.word)) options.push({ value: other.entry.word, label: wordLabel(other.entry), nounNumber: other.entry.singular.length ? 'singular' : 'plural' });
          if (options.length === 4) break;
        }
        recognition.push(question(meaning, options.length > 1 ? 'choice' : 'self', { options: shuffled(options, random) }));
      }
      recall.push(question(meaning, 'type'));
    }
    const grammarDue = card.questions.slice(1).filter(item => force || due(item) <= now).sort((a, b) => due(a) - due(b));
    if (grammarDue.length) {
      const item = grammarDue[0];
      grammar.push(question(item, item.choices ? 'choice' : 'type', { options: item.choices?.map(value => ({ value, label: value, nounNumber: 'singular' })) }));
    }
  }
  const nextDue = cards.flatMap(card => card.questions).map(due).filter(time => time > now).sort((a, b) => a - b)[0] ?? null;
  return { id: crypto.randomUUID(), startedAt: now, index: 0, questions: [...learning, ...recognition, ...recall, ...grammar], results: [], retried: [], finished: false, wordCount: chosen.length, nextDue };
}
export function checkAnswer(question, input) {
  let answer = normalizeAnswer(input);
  if (question.dimension === 'preterite') answer = answer.replace(/^ich\s+/iu, '');
  const expected = question.answers.map(normalizeAnswer);
  const correct = expected.some(value => question.noun ? value === answer : value.toLocaleLowerCase('de') === answer.toLocaleLowerCase('de'));
  const capitalization = !correct && expected.some(value => value.toLocaleLowerCase('de') === answer.toLocaleLowerCase('de'));
  return { correct, message: correct ? 'Richtig.' : capitalization ? 'Achte auf die Großschreibung des Nomens.' : 'Noch nicht. Vergleiche deine Antwort mit der gespeicherten Form.' };
}
export function answerQuestion(session, input, now = Date.now()) {
  if (!session || session.finished) return null;
  const question = session.questions[session.index];
  if (!question || question.mode === 'learn' || question.answered) return null;
  const feedback = question.mode === 'self' ? { correct: input === true, message: input === true ? 'Als gewusst markiert.' : 'Wir wiederholen das noch einmal.' } : checkAnswer(question, input);
  question.answered = true; question.feedback = feedback;
  const event = { id: crypto.randomUUID(), sessionId: session.id, questionKey: question.questionKey, dimension: question.dimension, mode: question.mode, correct: feedback.correct, at: now };
  session.results.push(event);
  if (!feedback.correct && !session.retried.includes(question.questionKey)) {
    session.retried.push(question.questionKey);
    const retry = { ...structuredClone(question), id: crypto.randomUUID(), mode: 'type', answered: false, feedback: undefined, options: undefined };
    session.questions.splice(Math.min(session.index + 4, session.questions.length), 0, retry);
  }
  return event;
}
export function advanceQuestion(session) {
  if (!session || session.finished) return false;
  const current = session.questions[session.index];
  if (!current || (current.mode !== 'learn' && !current.answered)) return false;
  session.index++;
  session.finished = session.index >= session.questions.length;
  return true;
}

export function validateSession(session) {
  if (!session || typeof session.id !== 'string' || !session.id || typeof session.finished !== 'boolean' || !Array.isArray(session.questions) || !Array.isArray(session.results) || !Array.isArray(session.retried) || session.retried.some(key => typeof key !== 'string') || !Number.isInteger(session.index) || session.index < 0 || session.index > session.questions.length || (!session.finished && session.index === session.questions.length) || session.questions.length > 100) throw new Error('Die gespeicherte Runde ist unlesbar.');
  mergeReviews(session.results);
  for (const question of session.questions) {
    validateMeaning(question.entry);
    if (!['learn', 'choice', 'type', 'self'].includes(question.mode) || !DIMENSIONS.includes(question.dimension) || typeof question.questionKey !== 'string' || !/^[a-f0-9]{64}$/u.test(question.questionKey) || !Array.isArray(question.answers) || !question.answers.length || question.answers.some(value => typeof value !== 'string' || !value.trim()) || typeof question.prompt !== 'string' || typeof question.instruction !== 'string' ||
      (question.mode === 'choice' && (!Array.isArray(question.options) || question.options.length < 2 || question.options.some(option => !option || typeof option.value !== 'string' || typeof option.label !== 'string'))) ||
      (question.answered && (typeof question.feedback?.correct !== 'boolean' || typeof question.feedback?.message !== 'string'))) throw new Error('Die gespeicherte Frage ist unlesbar.');
  }
  if (session.results.some(event => event.sessionId !== session.id || !session.questions.some(question => question.questionKey === event.questionKey))) throw new Error('Die Ergebnisse passen nicht zur gespeicherten Runde.');
  return session;
}

export function restorePracticeDraft(draft, entries) {
  const pending = mergeReviews(draft.pending);
  try {
    // Completed rounds are transient UI, not resumable work. Keep their pending
    // answers independently, including snapshots written by older app versions.
    if (draft.session?.finished === true) return { pending, session: null, warning: '' };
    const session = draft.session ? validateSession(draft.session) : null;
    const keys = new Set(entries.map(selectionKey));
    if (session && !session.finished && session.questions.some(question => !keys.has(selectionKey(question.entry)))) throw new Error('Die alte Runde enthält nicht mehr ausgewählte Wörter.');
    return { pending, session, warning: '' };
  } catch (error) {
    return { pending, session: null, warning: `${error.message} Die bisherigen Ergebnisse bleiben erhalten.` };
  }
}

export function practiceDraft(pending, session) {
  return { pending: mergeReviews(pending), session: session && !session.finished ? session : null };
}
