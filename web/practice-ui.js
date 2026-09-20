import { planSession, answerQuestion, advanceQuestion, mergeReviews, restorePracticeDraft, progressOverview, roundSummary, practiceDraft } from './practice.js';
import { selectionKey } from './library.js';

export function createPracticeUI({ getEntries, context, saveReviews, reloadReviews, wordHeading, appendForms, appendWordGrammar }) {
  const $ = selector => document.querySelector(selector);
  const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
  let sheetId = '', reviews = [], pending = new Map(), session = null, active = false, planning = false, saving = false, storageError = false;
  const panel = $('#practice-content');
  let overviewVersion = 0, latestOverview = null;
  const labels = { meaning: 'Bedeutung', article: 'Artikel', plural: 'Plural', comparative: 'Komparativ', superlative: 'Superlativ', preterite: 'Präteritum', participleII: 'Partizip II', auxiliary: 'Hilfsverb' };
  const dailyTarget = () => Number($('#practice-new-target').value);
  try {
    const remembered = localStorage.getItem('learngerman-daily-new-v1');
    if ([5, 10, 15].includes(Number(remembered))) $('#practice-new-target').value = remembered;
  } catch { /* Device-local preference is optional. */ }
  function updateStartButton() {
    const current = context(), ready = sheetId && current.id === sheetId;
    const noScheduledWork = latestOverview && !latestOverview.dueMeanings && !latestOverview.readyGrammarMeanings &&
      (!latestOverview.newRemaining || !latestOverview.newAvailable) && !$('#practice-force').checked;
    const start = $('#start-practice');
    start.disabled = planning || saving || current.busy || !ready || !getEntries().length || current.pendingVocabulary || Boolean(session && !session.finished) || Boolean(noScheduledWork);
    start.textContent = latestOverview?.dueMeanings ? 'Fällige Wörter üben'
      : latestOverview?.readyGrammarMeanings ? 'Neue Formen üben'
        : latestOverview?.newRemaining && latestOverview?.newAvailable ? `Bis zu ${Math.min(5, latestOverview.newRemaining, latestOverview.newAvailable)} neue Bedeutungen lernen`
          : $('#practice-force').checked ? 'Vorzeitig üben' : 'Übung starten';
  }
  async function renderOverview() {
    const version = ++overviewVersion, target = $('#practice-overview');
    target.hidden = active || Boolean(session?.finished);
    if (target.hidden) return;
    if (!sheetId || context().id !== sheetId) { latestOverview = null; target.replaceChildren(); return; }
    try {
      const overview = await progressOverview(getEntries(), reviews, Date.now(), { practicePlurals: $('#practice-plurals').checked, dailyNewTarget: dailyTarget() });
      if (version !== overviewVersion) return;
      latestOverview = overview; updateStartButton();
      const wasOpen = target.querySelector('.progress-details')?.open ?? false;
      target.replaceChildren();
      const counts = node('div', undefined, 'progress-counts');
      const dueCard = node('div'); dueCard.append(node('strong', String(overview.dueMeanings)), node('span', overview.overdueMeanings ? `fällig · ${overview.overdueMeanings} überfällig` : 'heute fällig')); counts.append(dueCard);
      const newCard = node('div'); newCard.append(node('strong', `${overview.introducedToday}/${overview.newAllowance}`), node('span', 'heute neu')); counts.append(newCard);
      const roundsCard = node('div'); roundsCard.append(node('strong', String(overview.estimatedRounds)), node('span', overview.estimatedRounds === 1 ? 'geschätzte Runde' : 'geschätzte Runden')); counts.append(roundsCard);
      target.append(counts);
      const details = node('details', undefined, 'progress-details'); details.open = wasOpen;
      details.append(node('summary', 'Lernfortschritt ansehen'), node('p', 'Gezählt werden ausgewählte Bedeutungen. Eine Bedeutung kann wegen ihrer Grammatik fällig sein.', 'hint'));
      for (const [label, data] of [['Bedeutungen', overview.meaning], ['Grammatikformen', overview.grammar]]) {
        details.append(node('p', `${label}: ${data.established} gefestigt · ${data.learning} in Übung · ${data.new} bereit${data.locked ? ` · ${data.locked} noch gesperrt` : ''}`, 'progress-line'));
      }
      details.append(node('p', `Heute können noch ${Math.min(overview.newRemaining, overview.newAvailable)} neue Bedeutungen beginnen. Bei einem großen Rückstand oder einer niedrigen letzten Trefferquote pausiert die App neue Bedeutungen automatisch.`, 'hint'));
      details.append(node('p', 'Grammatik wird schrittweise nach erfolgreichen Bedeutungswiederholungen freigeschaltet. Gefestigt = mindestens drei erfolgreiche, fällige Wiederholungen in Folge.', 'hint'));
      if (overview.nextDue) details.append(node('p', `Nächster geplanter Termin: ${new Date(overview.nextDue).toLocaleString('de-DE')}`, 'hint'));
      const stages = { new: 'bereit', locked: 'wird später freigeschaltet', retry: 'erneut üben', learning: 'in Übung', established: 'gefestigt' };
      for (const row of overview.rows) {
        const item = node('div', undefined, 'progress-word'); item.append(wordHeading(row.entry), node('p', row.entry.definition));
        for (const skill of row.skills) item.append(node('p', `${labels[skill.dimension]}: ${stages[skill.stage]}${skill.due ? ' · jetzt fällig' : skill.dueAt ? ` · ${new Date(skill.dueAt).toLocaleString('de-DE')}` : ''}${skill.difficult ? ' · braucht mehr Übung' : ''}`, 'hint'));
        details.append(item);
      }
      if (overview.rows.length) target.append(details);
    } catch (error) { if (version === overviewVersion) target.replaceChildren(node('p', `Fortschritt nicht verfügbar: ${error.message}`, 'error')); }
  }
  function message(text, error = false) { $('#practice-status').textContent = text; $('#practice-status').classList.toggle('error', error); }
  function persist() {
    if (!sheetId) return;
    try { sessionStorage.setItem(`learngerman-practice-v1:${sheetId}`, JSON.stringify(practiceDraft([...pending.values()], session))); storageError = false; }
    catch { storageError = true; }
  }
  function refresh() {
    const current = context();
    const ready = sheetId && current.id === sheetId;
    updateStartButton();
    $('#practice-panel').dataset.nextAction = active || session?.finished || !$('#start-practice').disabled ? ''
      : !ready ? 'settings' : current.pendingVocabulary ? 'words' : !getEntries().length ? 'add' : '';
    $('#resume-practice').hidden = !session || session.finished || active;
    $('#resume-practice').disabled = !ready || current.busy;
    $('#pause-practice').hidden = !active;
    $('#end-practice').hidden = !session || session.finished;
    $('#save-practice').disabled = saving || current.busy || !ready || !current.connected || !pending.size;
    $('#reload-practice').disabled = saving || current.busy || !current.id || !current.connected;
    $('#export-practice').disabled = !reviews.length;
    $('#import-practice').disabled = !ready || saving || current.busy;
    $('#practice-help').textContent = !ready ? 'Öffne zuerst deine Google-Vokabeltabelle.'
      : current.pendingVocabulary ? 'Speichere deine Wortauswahl, bevor du eine neue Runde beginnst.'
        : !getEntries().length ? 'Füge Wörter zu Meine Auswahl hinzu, um zu üben.'
          : latestOverview && !latestOverview.dueMeanings && !latestOverview.readyGrammarMeanings && (!latestOverview.newRemaining || !latestOverview.newAvailable)
            ? 'Für heute ist das geplante Pensum geschafft. Vorzeitiges Üben bleibt optional.' : 'Fällige Aufgaben kommen zuerst; neue Bedeutungen werden schrittweise freigegeben.';
    $('#practice-help').hidden = active || Boolean(session?.finished);
    $('#practice-save-state').textContent = `${pending.size ? `${pending.size} ${pending.size === 1 ? 'Antwort noch nicht' : 'Antworten noch nicht'} gespeichert. Unter „Lernfortschritt sichern / laden“ kannst du speichern oder eine Sicherung herunterladen.` : ''}${storageError ? ' Der Browser konnte die Runde nicht zwischenspeichern. Bitte Ergebnisse speichern oder herunterladen.' : ''}`;
    $('#vocabulary-workspace').hidden = active;
    $('#practice-start-controls').hidden = active || Boolean(session?.finished);
    renderOverview();
  }
  function accept(remote) {
    const combined = mergeReviews(remote, [...pending.values()]);
    const confirmed = new Set(remote.map(event => event.id));
    for (const id of confirmed) pending.delete(id);
    reviews = combined; persist(); refresh();
  }
  function setSheet(id, remote) {
    mergeReviews(remote);
    if (sheetId !== id) {
      sheetId = id; pending = new Map(); reviews = []; session = null; active = false; latestOverview = null;
      try {
        const draft = JSON.parse(sessionStorage.getItem(`learngerman-practice-v1:${id}`) || 'null');
        if (draft) {
          const restored = restorePracticeDraft(draft, getEntries());
          pending = new Map(restored.pending.map(event => [event.id, event])); session = restored.session;
          if (restored.warning) message(restored.warning, true);
        }
      } catch (error) { message(`Runde konnte nicht wiederhergestellt werden: ${error.message}`, true); }
    }
    accept(remote);
    render();
  }
  async function save() {
    if (saving || !pending.size) return;
    saving = true; refresh(); message('Lernfortschritt wird gespeichert …');
    try {
      const remote = await saveReviews([...pending.values()]);
      accept(remote); message(pending.size ? 'Gespeichert. Neuere Ergebnisse warten noch auf Speicherung.' : 'Lernfortschritt gespeichert und zurückgelesen.');
    } catch (error) { message(`${error.message} Deine Ergebnisse bleiben vorgemerkt.`, true); }
    finally { saving = false; persist(); refresh(); }
  }
  function button(label, action, className = '') {
    const element = node('button', label, className); element.type = 'button'; element.addEventListener('click', action); return element;
  }
  function showAnswer(parent, question) {
    if (question.dimension === 'meaning') parent.append(wordHeading(question.entry, 'strong'));
    else if (question.dimension === 'plural' || question.dimension === 'article') {
      const answer = node('strong');
      const forms = question.dimension === 'plural' ? question.entry.plural : question.answers.map(article => `${article} ${question.entry.word}`);
      appendForms(answer, forms, question.dimension === 'plural' ? 'plural' : 'singular');
      parent.append(answer);
    }
    else parent.append(node('strong', question.answers.join(' / ')));
  }
  function submit(input) {
    const event = answerQuestion(session, input);
    if (!event) return;
    pending.set(event.id, event); reviews = mergeReviews(reviews, [event]); persist(); render();
  }
  function next() {
    if (!advanceQuestion(session)) return;
    active = !session.finished; persist(); render();
    if (session.finished) save();
  }
  function characterBar(input) {
    const bar = node('div', undefined, 'character-bar practice-characters'); bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Deutsche Zeichen einfügen');
    for (const character of ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü', 'ẞ']) {
      const key = button(character, () => {
        const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
        if (input.value.length - (end - start) < input.maxLength) input.setRangeText(character, start, end, 'end');
        input.focus();
      }, 'character-key');
      key.setAttribute('aria-label', `${character} einfügen`); key.addEventListener('pointerdown', event => event.preventDefault()); bar.append(key);
    }
    return bar;
  }
  function render() {
    refresh(); panel.replaceChildren();
    if (!session) return;
    if (session.finished) {
      const summary = roundSummary(session);
      const result = node('section', undefined, 'round-summary'); result.setAttribute('aria-label', 'Ergebnis dieser Runde');
      result.append(node('p', 'ERGEBNIS DIESER RUNDE', 'eyebrow'), node('h3', 'Runde abgeschlossen'), node('p', `${summary.correctSkills} von ${summary.skills} Lernzielen ohne Fehler.`, 'round-score'));
      if (session.newMeaningCount) result.append(node('p', `${session.newMeaningCount} ${session.newMeaningCount === 1 ? 'neue Bedeutung wurde' : 'neue Bedeutungen wurden'} in dieser Runde begonnen.`, 'hint'));
      if (summary.needsPractice.length) {
        result.append(node('h4', 'Noch einmal üben'));
        const words = new Map();
        for (const skill of summary.needsPractice) {
          const key = selectionKey(skill.question.entry);
          if (!words.has(key)) words.set(key, []);
          words.get(key).push(skill);
        }
        for (const skills of words.values()) {
          const item = node('div', undefined, 'progress-word'), entry = skills[0].question.entry;
          item.append(wordHeading(entry), node('p', entry.definition));
          for (const { question } of skills) {
            const line = node('p', labels[question.dimension], 'round-skill');
            if (question.dimension !== 'meaning') {
              line.append(document.createTextNode(': '));
              if (question.dimension === 'article') {
                question.answers.forEach((article, index) => {
                  if (index) line.append(document.createTextNode(' / '));
                  line.append(node('span', article, `noun-form ${ { der: 'noun-masculine', die: 'noun-feminine', das: 'noun-neuter' }[article] }`));
                });
              } else showAnswer(line, question);
            }
            item.append(line);
          }
          result.append(item);
        }
      } else result.append(node('p', summary.skills ? 'Alle geübten Lernziele waren richtig.' : 'In dieser Runde wurden noch keine Antworten bewertet.'));
      const statistics = node('details', undefined, 'round-statistics');
      statistics.append(node('summary', 'Antwortstatistik'), node('p', `${summary.correctAnswers} von ${summary.answers} Antworten richtig, einschließlich Wiederholungsversuchen.`));
      result.append(statistics, button('Zur Übersicht', () => { session = null; persist(); message(''); render(); }));
      panel.append(result);
      return;
    }
    if (!active) { panel.append(node('p', 'Deine Runde ist pausiert. Du kannst an derselben Stelle fortsetzen.')); return; }
    const question = session.questions[session.index];
    const progress = node('progress'); progress.max = session.questions.length; progress.value = session.index; progress.setAttribute('aria-label', 'Fortschritt der Runde'); panel.append(progress);
    const stage = question.mode === 'learn' ? 'Kennenlernen' : question.mode === 'choice' ? 'Wiedererkennen' : question.mode === 'self' ? 'Karteikarte' : 'Erinnern';
    panel.append(node('p', `${stage} · Schritt ${session.index + 1} von ${session.questions.length}`, 'eyebrow'));
    if (question.mode === 'learn') {
      panel.append(wordHeading(question.entry, 'h3'), node('p', question.entry.definition, 'practice-definition'));
      if (question.entry.example) panel.append(node('p', question.entry.example, 'example'));
      if (question.entry.plural.length) { const plural = node('p', 'Plural: '); appendForms(plural, question.entry.plural, 'plural'); panel.append(plural); }
      appendWordGrammar(panel, question.entry);
      panel.append(button('Weiter', next)); return;
    }
    panel.append(node('p', question.instruction, 'hint'));
    const prompt = node('h3', undefined, 'practice-prompt');
    if (question.dimension === 'plural') appendForms(prompt, question.entry.singular, 'singular');
    else prompt.textContent = question.prompt;
    prompt.tabIndex = -1; panel.append(prompt);
    if (question.dimension !== 'meaning') panel.append(node('p', question.entry.definition, 'hint'));
    if (question.answered) {
      const feedback = node('div', undefined, question.feedback.correct ? 'practice-feedback' : 'practice-feedback retry'); feedback.setAttribute('role', 'status');
      feedback.append(node('p', question.feedback.message)); showAnswer(feedback, question);
      panel.append(feedback, button('Weiter', next));
      panel.querySelector('button').focus({ preventScroll: true }); return;
    }
    if (question.mode === 'choice') {
      const options = node('div', undefined, 'practice-options');
      for (const option of question.options) {
        const choice = button('', () => submit(option.value), 'secondary');
        if (question.dimension === 'article') {
          const article = node('span', option.label, `noun-form ${ { der: 'noun-masculine', die: 'noun-feminine', das: 'noun-neuter' }[option.value] }`); choice.append(article);
        } else appendForms(choice, [option.label], option.nounNumber);
        options.append(choice);
      }
      panel.append(options);
    } else if (question.mode === 'self') {
      const reveal = button('Antwort zeigen', () => {
        const answer = node('div', undefined, 'practice-feedback'); showAnswer(answer, question); reveal.replaceWith(answer);
        const actions = node('div', undefined, 'actions'); actions.append(button('Gewusst', () => submit(true)), button('Noch nicht', () => submit(false), 'secondary')); panel.append(actions);
      }); panel.append(reveal);
    } else {
      const form = node('form'); const label = node('label', 'Deine Antwort'); label.htmlFor = 'practice-answer';
      const input = node('input'); input.id = label.htmlFor; input.maxLength = 200; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('autocapitalize', 'off');
      form.append(characterBar(input), label, input, node('p', question.noun ? 'Achte auf Großschreibung, Umlaute und ß.' : 'Achte auf Umlaute und ß.', 'hint'));
      const check = node('button', 'Prüfen'); check.type = 'submit'; form.append(check, button('Weiß ich noch nicht', () => submit(''), 'text-button'));
      form.addEventListener('submit', event => { event.preventDefault(); submit(input.value); }); panel.append(form); input.focus({ preventScroll: true });
    }
  }
  $('#start-practice').addEventListener('click', async () => {
    if (planning || $('#start-practice').disabled) return;
    planning = true; refresh(); message('Runde wird vorbereitet …');
    try {
      session = await planSession(getEntries(), reviews, { force: $('#practice-force').checked, practicePlurals: $('#practice-plurals').checked, dailyNewTarget: dailyTarget() });
      if (!session.questions.length) {
        const plan = session.dailyPlan;
        const next = session.nextDue ? ` Nächste Wiederholung: ${new Date(session.nextDue).toLocaleString('de-DE')}.` : '';
        session = null;
        message(plan.newAvailable && !plan.newRemaining
          ? `Das Tagesziel für neue Bedeutungen ist erreicht.${next}`
          : `Für heute ist nichts fällig.${next} Du kannst nach den fälligen Aufgaben vorzeitig üben.`);
      } else { active = true; message('Ergebnisse werden am Ende der Runde in Google Sheets gespeichert.'); }
      persist(); render(); $('#practice-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { message(error.message, true); }
    finally { planning = false; refresh(); }
  });
  $('#pause-practice').addEventListener('click', () => { active = false; persist(); render(); });
  $('#practice-plurals').addEventListener('change', () => { latestOverview = null; renderOverview(); });
  $('#practice-force').addEventListener('change', updateStartButton);
  $('#practice-new-target').addEventListener('change', () => {
    try { localStorage.setItem('learngerman-daily-new-v1', $('#practice-new-target').value); } catch { /* Optional preference. */ }
    latestOverview = null; renderOverview();
  });
  $('#resume-practice').addEventListener('click', () => {
    const restored = restorePracticeDraft({ pending: [...pending.values()], session }, getEntries());
    session = restored.session; active = Boolean(session); persist(); render();
    if (restored.warning) message(restored.warning, true);
  });
  $('#end-practice').addEventListener('click', () => { if (!session) return; session.finished = true; active = false; persist(); render(); save(); });
  $('#save-practice').addEventListener('click', save);
  $('#reload-practice').addEventListener('click', async () => {
    try { const remote = await reloadReviews(); setSheet(context().id, remote); message('Lernfortschritt geladen.'); }
    catch (error) { message(error.message, true); }
  });
  $('#export-practice').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'LearnGerman-practice', version: 1, events: reviews }, null, 2)], { type: 'application/json' }));
    const link = node('a'); link.href = url; link.download = 'learngerman-lernfortschritt.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#import-practice').addEventListener('change', async event => {
    try {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) throw new Error('Bitte eine Datei unter 5 MB verwenden.');
      const data = JSON.parse(await file.text());
      if (data.format !== 'LearnGerman-practice' || data.version !== 1 || !Array.isArray(data.events)) throw new Error('Keine unterstützte Lernfortschritt-Datei.');
      const combined = mergeReviews(reviews, data.events), existing = new Set(reviews.map(item => item.id));
      for (const item of combined) if (!existing.has(item.id)) pending.set(item.id, item);
      reviews = combined; persist(); refresh(); message('Lernfortschritt ergänzt. Bitte speichern.');
    } catch (error) { message(error.message, true); }
    event.target.value = '';
  });
  refresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderOverview(); });
  return { setSheet, refresh, hasUnsaved: () => Boolean(pending.size || (session && !session.finished)) };
}
