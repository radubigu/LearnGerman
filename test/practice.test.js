import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceQuestions, planSession, checkAnswer, answerQuestion, advanceQuestion, reviewState, mergeReviews, reviewRows, parseReviews, REVIEW_HEADER, validateSession, restorePracticeDraft, progressOverview, roundSummary, practiceDraft } from '../web/practice.js';

const DAY = 86400000;
const entry = (word, extra = {}) => ({ id: word, origin: 'manual', word, definition: `Erfundene Erklärung für ${word}.`, pos: '', possiblePartsOfSpeech: [], singular: [], plural: [], source: '', example: '', ...extra });
const noun = entry('Fluss', { pos: 'noun', singular: ['der Fluss'], plural: ['die Flüsse'] });
const verb = entry('gehen', { pos: 'verb', grammar: { preterite: ['ging'], participleII: ['gegangen'], auxiliary: ['sein'] } });
const review = (question, extra = {}) => ({ id: crypto.randomUUID(), sessionId: 'round-1', questionKey: question.questionKey, dimension: question.dimension, mode: 'type', correct: true, at: DAY, ...extra });

test('practice uses only saved meanings/forms, skips missing and plural-only grammar, and preserves alternatives', async () => {
  const adjective = entry('schnell', { pos: 'adj', grammar: { comparative: ['schneller'], superlative: ['am schnellsten'] } });
  const cards = await practiceQuestions([noun, verb, adjective, entry('unbekannt'), entry('Ferien', { pos: 'noun', plural: ['die Ferien'] })]);
  assert.deepEqual(cards.map(card => card.questions.map(q => q.dimension)), [
    ['meaning', 'article', 'plural'], ['meaning', 'preterite', 'participleII', 'auxiliary'], ['meaning', 'comparative', 'superlative'], ['meaning'], ['meaning'],
  ]);
  assert.deepEqual(cards[0].questions[2].answers, ['die Flüsse', 'Flüsse']);
  assert.equal(cards[4].questions[0].answers.includes('die Ferien'), true);
  assert.equal(checkAnswer(cards[1].questions[1], 'ich ging').correct, true);
  assert.equal(checkAnswer(cards[2].questions[2], 'am schnellsten').correct, true);
});

test('noun recall enforces capitalization and umlauts, accepts NFC and recorded articles, and rejects wrong articles', async () => {
  const [{ questions }] = await practiceQuestions([noun]);
  assert.equal(checkAnswer(questions[0], ' Fluss ').correct, true);
  assert.equal(checkAnswer(questions[0], 'der Fluss').correct, true);
  assert.equal(checkAnswer(questions[0], 'die Fluss').correct, false);
  assert.match(checkAnswer(questions[0], 'fluss').message, /Großschreibung/);
  assert.equal(checkAnswer(questions[2], 'die Flu\u0308sse').correct, true);
  assert.equal(checkAnswer(questions[2], 'Flusse').correct, false);
});

test('new sessions use cards then recognition and recall, limited to five selected entries', async () => {
  const entries = Array.from({ length: 8 }, (_, index) => entry(`Wort${index}`));
  const session = await planSession(entries, [], { now: DAY, random: () => 0.5 });
  assert.equal(session.wordCount, 5);
  assert.deepEqual(session.questions.map(q => q.mode), [...Array(5).fill('learn'), ...Array(5).fill('choice'), ...Array(5).fill('type')]);
  for (const question of session.questions.filter(q => q.mode === 'choice')) {
    assert.equal(question.options.length, 4);
    assert.equal(question.options.filter(option => checkAnswer(question, option.value).correct).length, 1);
    assert.ok(question.options.every(option => entries.some(item => item.word === option.value)));
  }
  const alone = await planSession([noun], [], { now: DAY });
  assert.deepEqual(alone.questions.map(q => q.mode), ['learn', 'self', 'type', 'choice']);
});

test('identical saved definitions accept recorded synonyms and avoid ambiguous choice distractors', async () => {
  const words = [entry('oft', { definition: 'Viele Male.' }), entry('häufig', { definition: 'Viele Male.' })];
  const session = await planSession(words, []);
  assert.equal(session.questions.some(q => q.mode === 'choice'), false);
  const question = session.questions.find(q => q.entry.word === 'oft' && q.mode === 'type');
  assert.equal(checkAnswer(question, 'häufig').correct, true);
});

test('wrong answers repeat once, cannot be double-submitted, and refresh resumes without recounting', async () => {
  let session = await planSession([entry('lernen')], [], { now: DAY });
  assert.equal(answerQuestion(session, 'lernen'), null);
  advanceQuestion(session); // self-assessment
  assert.equal(advanceQuestion(session), false);
  const mistake = answerQuestion(session, false, DAY);
  assert.equal(mistake.correct, false);
  const length = session.questions.length;
  assert.equal(answerQuestion(session, true, DAY), null);
  session = validateSession(JSON.parse(JSON.stringify(session)));
  assert.equal(session.results.length, 1);
  advanceQuestion(session);
  answerQuestion(session, 'falsch', DAY + 1);
  assert.equal(session.questions.length, length);
  advanceQuestion(session);
  answerQuestion(session, 'lernen', DAY + 2);
  advanceQuestion(session);
  assert.equal(session.finished, true);
  assert.equal(answerQuestion(session, 'lernen'), null);
  assert.equal(advanceQuestion(session), false);
  const state = reviewState(session.results).get(mistake.questionKey);
  assert.equal(state.streak, 0);
  assert.equal(state.dueAt, DAY + 2 + 600000);
});

test('spaced review promotes once per session, respects due boundaries and ignores early successes', async () => {
  const [{ questions: [question] }] = await practiceQuestions([entry('lernen')]);
  const first = review(question, { at: DAY - 1 });
  const events = [first, { ...first }, review(question, { mode: 'choice', at: DAY })];
  let state = reviewState(events).get(question.questionKey);
  assert.deepEqual(state, { streak: 1, dueAt: DAY * 2 });
  events.push(review(question, { sessionId: 'early', at: DAY * 2 - 1 }));
  assert.deepEqual(reviewState(events).get(question.questionKey), state);
  events.push(review(question, { sessionId: 'due', at: DAY * 2 }));
  state = reviewState(events).get(question.questionKey);
  assert.deepEqual(state, { streak: 2, dueAt: DAY * 5 });
  assert.equal((await planSession([question.entry], events, { now: DAY * 5 - 1 })).questions.length, 0);
  assert.equal((await planSession([question.entry], events, { now: DAY * 5 })).questions[0].mode, 'type');
  assert.ok((await planSession([question.entry], events, { now: DAY * 3, force: true })).questions.length);
  events.push(review(question, { sessionId: 'lapse', at: DAY * 5 + 1, correct: false }));
  assert.equal(reviewState(events).get(question.questionKey).streak, 0);
});

test('meaning and grammar progress separately; untested grammar rotates and edited forms get new progress keys', async () => {
  const [{ questions }] = await practiceQuestions([verb]);
  const events = [review(questions[0]), review(questions[1])];
  const session = await planSession([verb], events, { now: DAY + 1 });
  assert.deepEqual(session.questions.map(q => q.dimension), ['participleII']);
  events.push(review(questions[2]));
  assert.equal((await planSession([verb], events, { now: DAY + 1 })).questions[0].dimension, 'auxiliary');
  const [changed] = await practiceQuestions([{ ...verb, grammar: { ...verb.grammar, preterite: ['andere Form'] } }]);
  assert.equal(changed.questions[0].questionKey, questions[0].questionKey);
  assert.notEqual(changed.questions[1].questionKey, questions[1].questionKey);
});

test('due learned words take priority over new words', async () => {
  const known = entry('lernen');
  const [{ questions: [question] }] = await practiceQuestions([known]);
  const session = await planSession([entry('neu'), known], [review(question)], { now: DAY * 2, limit: 1 });
  assert.equal(session.wordCount, 1);
  assert.equal(session.questions[0].entry.word, 'lernen');
});

test('review import/journal merges independently of row order and rejects corrupt or conflicting IDs', async () => {
  const [{ questions: [question] }] = await practiceQuestions([noun]);
  const events = [review(question), review(question, { sessionId: 'round-2', at: DAY * 2 })];
  assert.deepEqual(parseReviews([REVIEW_HEADER, ...reviewRows(events), ...reviewRows(events)]), events);
  assert.deepEqual(reviewState(events), reviewState([...events].reverse()));
  assert.throws(() => mergeReviews(events, [{ ...events[0], correct: false }]), /Widersprüchliche/);
  assert.throws(() => parseReviews([['wrong schema']]), /Format/);
  assert.throws(() => parseReviews([REVIEW_HEADER, ['wrong-id', JSON.stringify(events[0])]]), /ID/);
  assert.throws(() => mergeReviews([{ ...events[0], at: null }]), /Ungültiger/);
});

test('stale or corrupt round recovery retains valid unsaved results', async () => {
  const session = await planSession([noun], []);
  advanceQuestion(session); answerQuestion(session, true);
  const draft = JSON.parse(JSON.stringify({ pending: session.results, session }));
  assert.equal(restorePracticeDraft(draft, [noun]).session.index, 1);
  const stale = restorePracticeDraft(draft, []);
  assert.equal(stale.session, null);
  assert.equal(stale.pending.length, 1);
  assert.match(stale.warning, /Ergebnisse bleiben/);
  draft.session.questions[1].mode = 'choice'; draft.session.questions[1].options = null;
  const corrupt = restorePracticeDraft(draft, [noun]);
  assert.equal(corrupt.session, null);
  assert.equal(corrupt.pending.length, 1);
});

test('overview distinguishes new meanings, due reviews, and independent grammar including due boundaries', async () => {
  const [{ questions }] = await practiceQuestions([noun]);
  const events = [review(questions[0]), review(questions[1], { correct: false })];
  const before = await progressOverview([noun, entry('neu')], events, DAY + 599999);
  assert.equal(before.newMeanings, 1); assert.equal(before.dueMeanings, 0);
  assert.equal(before.meaning.learning, 1); assert.equal(before.grammar.new, 1);
  const due = await progressOverview([noun, entry('neu')], events, DAY + 600000);
  assert.equal(due.dueMeanings, 1); assert.equal(due.grammar.due, 1);
  assert.equal((await progressOverview([], events)).meaning.total, 0);
  assert.equal((await progressOverview([entry('neu')], events)).dueMeanings, 0);
});

test('established progress requires three scheduled successes; round summary counts retries once per skill', async () => {
  const [{ questions }] = await practiceQuestions([noun]);
  const events = [review(questions[0]), review(questions[0], { sessionId: 'r2', at: DAY * 2 }), review(questions[0], { sessionId: 'r3', at: DAY * 5 })];
  assert.equal((await progressOverview([noun], events, DAY * 5)).meaning.established, 1);
  const session = await planSession([noun], []);
  advanceQuestion(session); answerQuestion(session, false);
  advanceQuestion(session); answerQuestion(session, 'Bank');
  const summary = roundSummary(session);
  assert.equal(summary.skills, 1); assert.equal(summary.needsPractice.length, 1); assert.equal(summary.answers, 2);
  assert.equal(roundSummary({ questions: [], results: [] }).skills, 0);
});

test('refresh drops completed round summaries from old storage but preserves unsaved answers', async () => {
  const session = await planSession([noun], []);
  advanceQuestion(session); answerQuestion(session, true);
  session.finished = true;
  const legacy = JSON.parse(JSON.stringify({ pending: session.results, session }));
  const restored = restorePracticeDraft(legacy, [noun]);
  assert.equal(restored.session, null);
  assert.equal(restored.warning, '');
  assert.deepEqual(restored.pending, session.results);
  assert.deepEqual(practiceDraft(session.results, session), { pending: session.results, session: null });
  assert.deepEqual(restorePracticeDraft({ pending: [], session }, []), { pending: [], session: null, warning: '' });
});

test('unfinished rounds still survive refresh at the same question without double-counting answers', async () => {
  const session = await planSession([noun], []);
  advanceQuestion(session); answerQuestion(session, true);
  const saved = JSON.parse(JSON.stringify(practiceDraft(session.results, session)));
  const restored = restorePracticeDraft(saved, [noun]);
  assert.equal(restored.session.index, session.index);
  assert.equal(restored.session.finished, false);
  assert.equal(restored.pending.length, 1);
  assert.equal(answerQuestion(restored.session, true), null);
});
