import { selectionKey, validateMeaning } from './library.js';
import { GRAMMAR_FIELDS } from './grammar.js';

export const REVIEW_TAB = 'LearnGerman_Review_V1';
export const REVIEW_HEADER = ['LearnGerman practice v1', 'Ergebnis JSON'];
const DAY = 86400000;
const INTERVALS = [1, 3, 7, 14, 30, 60, 120, 240, 365];
export const DEFAULT_DAILY_NEW = 10;
const REDUCED_DAILY_NEW = 5;
const BACKLOG_REDUCE_AT = 30;
const BACKLOG_PAUSE_AT = 60;
const ACCURACY_REDUCE_AT = 0.85;
const ACCURACY_PAUSE_AT = 0.75;
const ACCURACY_MIN_ATTEMPTS = 10;
const ACCURACY_WINDOW = 30 * DAY;
const QUESTION_HASH_CACHE_LIMIT = 10000;
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
function sessionResults(events) {
  const sessions = new Map();
  for (const event of mergeReviews(events)) {
    const key = JSON.stringify([event.sessionId, event.questionKey]);
    const previous = sessions.get(key);
    sessions.set(key, { key: event.questionKey, dimension: event.dimension, id: key, correct: event.correct && (previous?.correct ?? true), at: Math.max(event.at, previous?.at ?? 0) });
  }
  return [...sessions.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
export function reviewState(events) {
  const state = new Map();
  for (const result of sessionResults(events)) {
    const previous = state.get(result.key);
    if (!result.correct) {
      const lapseFrom = previous?.streak > 0 ? previous.streak : previous?.lapseFrom ?? 0;
      state.set(result.key, { streak: 0, dueAt: result.at + 600000, ...(lapseFrom ? { lapseFrom } : {}) });
    }
    // Extra practice before a scheduled review cannot accelerate promotion.
    else if (!previous || result.at >= previous.dueAt) {
      const streak = previous?.streak === 0 && previous.lapseFrom
        ? Math.max(1, previous.lapseFrom - 2)
        : Math.min((previous?.streak ?? 0) + 1, INTERVALS.length);
      state.set(result.key, { streak, dueAt: result.at + INTERVALS[streak - 1] * DAY });
    }
  }
  return state;
}
const questionHashCache = new Map();
async function questionHash(entry, dimension, answers) {
  const identity = [selectionKey(entry), dimension, [...answers].sort()];
  if (dimension === 'meaning' && entry.originalDefinition !== undefined && entry.definition !== entry.originalDefinition) identity.push(entry.definition);
  const cacheKey = JSON.stringify(identity);
  if (!questionHashCache.has(cacheKey)) {
    if (questionHashCache.size >= QUESTION_HASH_CACHE_LIMIT) questionHashCache.delete(questionHashCache.keys().next().value);
    const data = new TextEncoder().encode(cacheKey);
    questionHashCache.set(cacheKey, crypto.subtle.digest('SHA-256', data).then(digest => [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')));
  }
  try { return await questionHashCache.get(cacheKey); }
  catch (error) { questionHashCache.delete(cacheKey); throw error; }
}
function wordLabel(entry) { return entry.singular[0] ?? entry.plural[0] ?? entry.word; }
export async function practiceQuestions(entries) {
  entries.forEach(validateMeaning);
  const byDefinition = new Map();
  for (const entry of entries) {
    const key = normalizeAnswer(entry.definition);
    if (!byDefinition.has(key)) byDefinition.set(key, []);
    byDefinition.get(key).push(entry);
  }
  return Promise.all(entries.map(async entry => {
    const sameMeaning = byDefinition.get(normalizeAnswer(entry.definition));
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

const startOfLocalDay = now => { const date = new Date(now); date.setHours(0, 0, 0, 0); return date.getTime(); };
const includedQuestion = (question, practicePlurals) => practicePlurals || question.dimension !== 'plural';
function availableQuestions(card, state, practicePlurals) {
  const meaning = card.questions[0], meaningState = state.get(meaning.questionKey);
  const grammar = card.questions.slice(1).filter(question => includedQuestion(question, practicePlurals));
  const unlocked = meaningState?.streak >= 2 ? grammar.length : meaningState?.streak >= 1 ? 1 : 0;
  return [meaning, ...grammar.filter((question, index) => index < unlocked || state.has(question.questionKey))];
}
function schedulingPlan(cards, events, state, now, { dailyNewTarget = DEFAULT_DAILY_NEW, practicePlurals = false } = {}) {
  const target = Number.isInteger(Number(dailyNewTarget)) ? Math.max(0, Math.min(50, Number(dailyNewTarget))) : DEFAULT_DAILY_NEW;
  const dayStart = startOfLocalDay(now), selectedMeaningKeys = new Set(cards.map(card => card.questions[0].questionKey));
  const firstMeaningAt = new Map();
  for (const event of mergeReviews(events)) {
    if (event.dimension !== 'meaning' || !selectedMeaningKeys.has(event.questionKey)) continue;
    firstMeaningAt.set(event.questionKey, Math.min(event.at, firstMeaningAt.get(event.questionKey) ?? event.at));
  }
  const introducedToday = [...firstMeaningAt.values()].filter(time => time >= dayStart && time <= now).length;
  const recent = sessionResults(events).filter(result => result.at >= now - ACCURACY_WINDOW && result.at <= now);
  const recentAccuracy = recent.length ? recent.filter(result => result.correct).length / recent.length : null;
  const dueSkills = cards.flatMap(card => availableQuestions(card, state, practicePlurals))
    .filter(question => state.has(question.questionKey) && state.get(question.questionKey).dueAt <= now).length;
  const reduceForAccuracy = recent.length >= ACCURACY_MIN_ATTEMPTS && recentAccuracy < ACCURACY_REDUCE_AT;
  const pauseForAccuracy = recent.length >= ACCURACY_MIN_ATTEMPTS && recentAccuracy < ACCURACY_PAUSE_AT;
  const newAllowance = dueSkills > BACKLOG_PAUSE_AT || pauseForAccuracy ? 0
    : dueSkills > BACKLOG_REDUCE_AT || reduceForAccuracy ? Math.min(target, REDUCED_DAILY_NEW) : target;
  const newAvailable = cards.filter(card => !state.has(card.questions[0].questionKey)).length;
  return { target, dayStart, dueSkills, introducedToday, newAllowance, newRemaining: Math.max(0, newAllowance - introducedToday), newAvailable, recentAttempts: recent.length, recentAccuracy };
}

export async function dailyPracticePlan(entries, events, now = Date.now(), options = {}) {
  const cards = await practiceQuestions(entries), state = reviewState(events);
  const plan = schedulingPlan(cards, events, state, now, options);
  const rows = cards.map(card => availableQuestions(card, state, options.practicePlurals ?? false));
  const dueCards = rows.filter(questions => questions.some(question => state.has(question.questionKey) && state.get(question.questionKey).dueAt <= now));
  const overdueCards = rows.filter(questions => questions.some(question => state.has(question.questionKey) && state.get(question.questionKey).dueAt < plan.dayStart));
  const readyGrammarCards = cards.filter(card => state.has(card.questions[0].questionKey) && availableQuestions(card, state, options.practicePlurals ?? false).slice(1).some(question => !state.has(question.questionKey)));
  const work = dueCards.length + readyGrammarCards.filter(card => !dueCards.some(questions => questions[0].entry === card.entry)).length + Math.min(plan.newRemaining, plan.newAvailable);
  return { ...plan, dueMeanings: dueCards.length, overdueMeanings: overdueCards.length, dueTodayMeanings: dueCards.length - overdueCards.length,
    readyGrammarMeanings: readyGrammarCards.length, estimatedRounds: Math.ceil(work / 5) };
}

export async function progressOverview(entries, events, now = Date.now(), { practicePlurals = false, dailyNewTarget = DEFAULT_DAILY_NEW } = {}) {
  const cards = await practiceQuestions(entries), state = reviewState(events);
  const plan = schedulingPlan(cards, events, state, now, { practicePlurals, dailyNewTarget });
  const recentFailures = new Map();
  for (const result of sessionResults(events)) if (!result.correct && result.at >= now - ACCURACY_WINDOW) recentFailures.set(result.key, (recentFailures.get(result.key) ?? 0) + 1);
  const rows = cards.map(card => {
    const available = new Set(availableQuestions(card, state, practicePlurals).map(question => question.questionKey));
    const skills = card.questions.filter(question => includedQuestion(question, practicePlurals)).map(question => {
      const progress = state.get(question.questionKey);
      const locked = question.dimension !== 'meaning' && !available.has(question.questionKey);
      return { dimension: question.dimension, questionKey: question.questionKey, stage: locked ? 'locked' : !progress ? 'new' : progress.streak === 0 ? 'retry' : progress.streak >= 3 ? 'established' : 'learning',
        dueAt: progress?.dueAt ?? null, due: Boolean(!locked && progress && progress.dueAt <= now), difficult: (recentFailures.get(question.questionKey) ?? 0) >= 3 };
    });
    return { entry: card.entry, skills };
  });
  const counts = skills => ({ total: skills.length, new: skills.filter(skill => skill.stage === 'new').length, due: skills.filter(skill => skill.due).length, established: skills.filter(skill => skill.stage === 'established').length, learning: skills.filter(skill => ['learning', 'retry'].includes(skill.stage)).length, locked: skills.filter(skill => skill.stage === 'locked').length });
  const overdueMeanings = rows.filter(row => row.skills.some(skill => skill.dueAt !== null && skill.dueAt < plan.dayStart)).length;
  const dueMeanings = rows.filter(row => row.skills.some(skill => skill.due)).length;
  const readyGrammarMeanings = rows.filter(row => row.skills.slice(1).some(skill => skill.stage === 'new')).length;
  const estimatedWork = dueMeanings + rows.filter(row => row.skills.slice(1).some(skill => skill.stage === 'new') && !row.skills.some(skill => skill.due)).length + Math.min(plan.newRemaining, plan.newAvailable);
  return { rows, newMeanings: rows.filter(row => row.skills[0].stage === 'new').length,
    dueMeanings, overdueMeanings, dueTodayMeanings: dueMeanings - overdueMeanings, readyGrammarMeanings,
    meaning: counts(rows.map(row => row.skills[0])), grammar: counts(rows.flatMap(row => row.skills.slice(1))),
    nextDue: rows.flatMap(row => row.skills).map(skill => skill.dueAt).filter(time => time > now).sort((a, b) => a - b)[0] ?? null,
    ...plan, estimatedRounds: Math.ceil(estimatedWork / 5) };
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
export async function planSession(entries, reviews, { now = Date.now(), limit = 5, force = false, practicePlurals = false, dailyNewTarget = DEFAULT_DAILY_NEW, random = Math.random } = {}) {
  const cards = await practiceQuestions(entries), state = reviewState(reviews);
  const due = question => state.get(question.questionKey)?.dueAt ?? 0;
  const plan = schedulingPlan(cards, reviews, state, now, { practicePlurals, dailyNewTarget });
  const available = card => availableQuestions(card, state, practicePlurals);
  const practicedDue = card => available(card).filter(item => state.has(item.questionKey) && due(item) <= now);
  const newGrammar = card => state.has(card.questions[0].questionKey) && available(card).slice(1).filter(item => !state.has(item.questionKey));
  const dueCards = cards.filter(card => practicedDue(card).length).sort((a, b) => Math.min(...practicedDue(a).map(due)) - Math.min(...practicedDue(b).map(due)));
  const dueKeys = new Set(dueCards.map(card => card.questions[0].questionKey));
  const grammarCards = cards.filter(card => !dueKeys.has(card.questions[0].questionKey) && newGrammar(card).length);
  const rawNewCards = cards.filter(card => !state.has(card.questions[0].questionKey)), seenNewWords = new Set(), repeatedNewWords = [];
  const distinctNewWords = rawNewCards.filter(card => {
    const spelling = normalizeAnswer(card.entry.word).toLocaleLowerCase('de');
    if (seenNewWords.has(spelling)) { repeatedNewWords.push(card); return false; }
    seenNewWords.add(spelling); return true;
  });
  const newCards = [...distinctNewWords, ...repeatedNewWords].slice(0, plan.newRemaining);
  const occupied = new Set([...dueCards, ...grammarCards, ...newCards].map(card => card.questions[0].questionKey));
  const earlyCards = force ? cards.filter(card => state.has(card.questions[0].questionKey) && !occupied.has(card.questions[0].questionKey)) : [];
  const chosen = [];
  const take = (source, maximum = limit - chosen.length) => {
    for (const card of source) {
      if (chosen.length >= limit || maximum <= 0) break;
      if (!chosen.includes(card)) { chosen.push(card); maximum--; }
    }
  };
  if (plan.dueSkills > BACKLOG_PAUSE_AT && dueCards.length) take(dueCards);
  else if (plan.dueSkills > BACKLOG_REDUCE_AT && dueCards.length) {
    take(dueCards, Math.min(4, dueCards.length));
    take(newCards, 1);
    take(dueCards); take(grammarCards); take(newCards); take(earlyCards);
  }
  else {
    take(dueCards, Math.min(3, dueCards.length));
    take(grammarCards, Math.min(1, grammarCards.length));
    take(newCards, Math.min(2, newCards.length));
    take(dueCards); take(grammarCards); take(newCards); take(earlyCards);
  }
  const learning = [], recognition = [], recall = [], grammar = [];
  const question = (base, mode, extra = {}) => ({ ...structuredClone(base), id: crypto.randomUUID(), mode, ...extra });
  for (const card of chosen) {
    const meaning = card.questions[0];
    const current = state.get(meaning.questionKey);
    const isNew = !current;
    if (isNew || (current && due(meaning) <= now) || (force && current)) {
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
    const grammarDue = current?.streak === 0 ? [] : available(card).slice(1).filter(item => !state.has(item.questionKey) || due(item) <= now || force)
      .sort((a, b) => (state.has(a.questionKey) ? 0 : 1) - (state.has(b.questionKey) ? 0 : 1) || due(a) - due(b));
    if (grammarDue.length) {
      const item = grammarDue[0];
      grammar.push(question(item, item.choices ? 'choice' : 'type', { options: item.choices?.map(value => ({ value, label: value, nounNumber: 'singular' })) }));
    }
  }
  const nextDue = cards.flatMap(available).filter(item => state.has(item.questionKey)).map(due).filter(time => time > now).sort((a, b) => a - b)[0] ?? null;
  const newMeaningCount = chosen.filter(card => !state.has(card.questions[0].questionKey)).length;
  return { id: crypto.randomUUID(), startedAt: now, index: 0, questions: [...learning, ...recognition, ...recall, ...grammar], results: [], retried: [], finished: false,
    wordCount: chosen.length, newMeaningCount, nextDue, dailyPlan: { ...plan, newRemaining: Math.max(0, plan.newRemaining - newMeaningCount) } };
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
