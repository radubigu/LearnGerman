import './app.js';

const views = {
  practice: ['ÜBEN', 'Üben', 'Wiederhole die Bedeutungen und Formen aus deiner Auswahl.'],
  add: ['WORTSCHATZ ERWEITERN', 'Wörter hinzufügen', 'Finde passende Bedeutungen für ein Wort oder gehe eine Liste durch.'],
  words: ['DEINE AUSWAHL', 'Meine Wörter', 'Sieh deine ausgewählten Bedeutungen an und bearbeite sie.'],
  settings: ['DEINE VERBINDUNG', 'Einstellungen', 'Verbinde deinen privaten Wortschatz mit Google Sheets.'],
};
const $ = selector => document.querySelector(selector);
const buttons = [...document.querySelectorAll('.v2-nav [data-view]')];
let currentView = 'practice';

function practiceActive() { return !$('#pause-practice').hidden; }

function showView(view, scroll = false) {
  if (!views[view]) view = 'practice';
  if (practiceActive() && view !== 'practice') {
    view = 'practice';
    history.replaceState(null, '', '#practice');
  }
  currentView = view;
  document.body.dataset.view = view;
  $('#v2-eyebrow').textContent = views[view][0];
  $('#v2-title').textContent = views[view][1];
  $('#v2-description').textContent = views[view][2];
  $('#practice-panel').hidden = view !== 'practice';
  $('#vocabulary-workspace').hidden = view !== 'add' && view !== 'words';
  $('.lookup').hidden = view !== 'add';
  $('.collection').hidden = view !== 'words';
  $('.connection').hidden = view !== 'settings';
  for (const button of buttons) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    button.disabled = practiceActive() && button.dataset.view !== 'practice';
  }
  document.title = `${views[view][1]} · Deutsch`;
  if (scroll) {
    $('#v2-title').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function route() {
  const view = location.hash.slice(1);
  showView(views[view] ? view : currentView);
}
function navigate(view) {
  if (practiceActive() && view !== 'practice') return;
  if (location.hash !== `#${view}`) location.hash = view;
  showView(view, true);
}
for (const button of buttons) button.addEventListener('click', () => navigate(button.dataset.view));
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => {
  const view = button.dataset.go;
  navigate(view);
  if (view === 'settings') $('#connection-details').open = true;
}));
window.addEventListener('hashchange', route);

new MutationObserver(() => {
  if (practiceActive() && currentView !== 'practice') showView('practice');
  for (const button of buttons) button.disabled = practiceActive() && button.dataset.view !== 'practice';
}).observe($('#pause-practice'), { attributes: true, attributeFilter: ['hidden'] });

function syncGuidance() {
  const count = Number($('#count').textContent) || 0;
  $('#v2-word-count').textContent = String(count);
  $('#v2-words-empty').hidden = count > 0;
  $('#v2-words-connect').hidden = !$('#load-library').disabled;
  $('#save-library').hidden = count === 0;
  $('#load-library').hidden = count === 0 && $('#load-library').disabled;
  $('#v2-library-actions').hidden = count === 0 && $('#load-library').disabled;
  $('#download').hidden = count === 0;
  $('#v2-list-hint').hidden = count === 0;
  $('#v2-add-selection').hidden = count === 0;
  $('#v2-add-count').textContent = `${count} ${count === 1 ? 'Bedeutung' : 'Bedeutungen'} ausgewählt`;
  const action = $('#practice-panel').dataset.nextAction;
  const guidance = $('#v2-practice-guidance');
  guidance.hidden = !action;
  if (action) {
    const button = guidance.querySelector('button');
    button.dataset.go = action;
    button.textContent = { settings: 'Einstellungen öffnen', words: 'Meine Wörter öffnen', add: 'Wörter hinzufügen' }[action];
  }
}
new MutationObserver(syncGuidance).observe($('#count'), { childList: true, characterData: true, subtree: true });
new MutationObserver(syncGuidance).observe($('#load-library'), { attributes: true, attributeFilter: ['disabled'] });
new MutationObserver(syncGuidance).observe($('#practice-panel'), { attributes: true, attributeFilter: ['data-next-action'] });
syncGuidance();
route();
