// Begrepp — PWA V5 (multi-subject + subject picker)
//
// Arkitektur:
//   • Första skärm: subject picker (lista av ämnen, exkl. archived).
//   • Per ämne: egen uppsättning begrepp + valbara träningslägen (declarativt via JSON).
//   • localStorage-mastery per kort-id (globalt unikt över ämnen).
//   • Senast valda ämne sparas → återöppnas direkt om appen är PWA-installad.
//
// Träningslägen (per ämne, deklarerade i JSON.modes):
//   • Forward (Begrepp → Förklaring): reading explanation — INGET app-läge.
//   • Reverse (Förklaring → Begrepp): recall begreppet — app-läge möjligt.
//
// App-läge (bara reverse):
//   • Input + Rätta jämför mot begreppet.
//   • Rätt → ✓ Rät!, auto-advance ~0.8s, saveMastery(true).
//   • Fel → ✗ Inte rätt med diff, [Nästa →] manuell, saveMastery(false).
//
// Audio: per-kart 4 fält (audio_fraga, audio_svar, audio_reverse_fraga, audio_reverse_svar).
//   • Saknas audio för aktuellt läge → audio-knapparna döljs helt (visuellt läge).
//
// Navigation: ← Bak / Nästa → fritt genom listan. Rätta påverkar listan oavsett position.

const STORAGE_KEY = 'begrepp-mastery-v3';
const APP_MODE_KEY = '***';
const SUBJECT_STORAGE_KEY = 'begrepp-last-subject-v5';
const INSTALL_HINT_DISMISSED_KEY = 'begrepp-install-hint-dismissed';

// === AUDIO PRIMING ===
let audioPrimed = false;
function primeAudio() {
  if (audioPrimed) return;
  audioPrimed = true;
  const priming = new Audio('audio/priming.mp3');
  priming.volume = 0;
  priming.play().catch(() => {});
  document.removeEventListener('pointerdown', primeAudio);
  document.removeEventListener('touchstart', primeAudio);
  document.removeEventListener('keydown', primeAudio);
}
document.addEventListener('pointerdown', primeAudio, { once: true, passive: true });
document.addEventListener('touchstart', primeAudio, { once: true, passive: true });
document.addEventListener('keydown', primeAudio, { once: true, passive: true });
const INITIAL_DELAY_MS = 300;

// === STATE ===
let data = null;                    // { version, subjects: [...] }
let currentSubject = null;          // currently selected subject obj
let order = [];                      // dynamic order (shuffled, fails moved to end)
let currentIndex = 0;
let masteredThisSession = [];
let sessionRepeats = 0;
let sessionAttempts = [];
let currentCard = null;
let currentMode = 'forward';
let appMode = 'paper';              // 'paper' | 'app' (only relevant in reverse)
let revealed = false;
let activeChain = null;
let streak = 0;
let deferredInstallPrompt = null;

// === DOM ===
const cardEl = document.getElementById('card');
const promptEl = document.getElementById('prompt');
const answerEl = document.getElementById('answer');
const imageAreaEl = document.getElementById('imageArea');
const feedbackEl = document.getElementById('feedback');
const audioPromptBtn = document.getElementById('audioPromptBtn');
const audioAnswerBtn = document.getElementById('audioAnswerBtn');
const audioButtonsEl = document.querySelector('.audio-buttons');
const revealBtn = document.getElementById('revealBtn');
const selfAssessEl = document.getElementById('selfAssess');
const rattBtn = document.getElementById('rattBtn');
const felBtn = document.getElementById('felBtn');
const guessInput = document.getElementById('guessInput');
const inputRow = document.getElementById('inputRow');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const progressBar = document.getElementById('progressBar');
const currentSpan = document.getElementById('current');
const totalSpan = document.getElementById('total');
const streakCounter = document.getElementById('streakCounter');
const streakNum = document.getElementById('streakNum');
const modeForwardBtn = document.getElementById('modeForwardBtn');
const modeReverseBtn = document.getElementById('modeReverseBtn');
const paperAppToggle = document.getElementById('paperAppToggle');
const appModePaperBtn = document.getElementById('appModePaperBtn');
const appModeAppBtn = document.getElementById('appModeAppBtn');
const summaryEl = document.getElementById('summary');
const startOverBtn = document.getElementById('startOverBtn');
const installHint = document.getElementById('installHint');
const installBtn = document.getElementById('installBtn');
const dismissInstallBtn = document.getElementById('dismissInstall');
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const subjectPickerEl = document.getElementById('subjectPicker');
const backToSubjectsBtn = document.getElementById('backToSubjectsBtn');
const refreshDataBtn = document.getElementById('refreshDataBtn');

// === AUDIO ENGINE (oförändrad från V3.9) ===

function cancelChain() {
  if (activeChain) {
    activeChain.cancelled = true;
    for (const audio of activeChain.audios) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) { /* ignore */ }
    }
    activeChain = null;
  }
}

function playChain(sources) {
  cancelChain();
  if (!sources || sources.length === 0) return;

  const chain = { cancelled: false, audios: [] };
  activeChain = chain;

  sources.forEach(src => {
    const a = new Audio();
    a.preload = 'auto';
    a.src = src;
    try { a.load(); } catch (e) { /* ignore */ }
    chain.audios.push(a);
  });

  let index = 0;
  let started = false;

  function playNext() {
    if (chain.cancelled || index >= sources.length) {
      if (activeChain === chain) activeChain = null;
      return;
    }
    const audio = chain.audios[index++];
    audio.onended = () => playNext();
    audio.onerror = () => playNext();
    audio.play().catch(() => playNext());
  }

  const firstAudio = chain.audios[0];
  const startWhenReady = () => {
    if (chain.cancelled || started) return;
    started = true;
    playNext();
  };
  if (firstAudio.readyState >= 3) {
    startWhenReady();
  } else {
    firstAudio.addEventListener('canplaythrough', startWhenReady, { once: true });
    firstAudio.addEventListener('canplay', startWhenReady, { once: true });
    setTimeout(startWhenReady, 1500);
  }
}

function getInitialSources() {
  if (!currentCard) return [];
  if (currentMode === 'forward') {
    return currentCard.audio_fraga ? [currentCard.audio_fraga] : [];
  }
  return currentCard.audio_reverse_fraga ? [currentCard.audio_reverse_fraga] : [];
}

function getAnswerSources() {
  if (!currentCard) return [];
  if (currentMode === 'forward') {
    return currentCard.audio_svar ? [currentCard.audio_svar] : [];
  }
  return currentCard.audio_reverse_svar ? [currentCard.audio_reverse_svar] : [];
}

function hasAudioForCurrentCard() {
  if (!currentCard) return false;
  if (currentMode === 'forward') {
    return !!(currentCard.audio_fraga || currentCard.audio_svar);
  }
  return !!(currentCard.audio_reverse_fraga || currentCard.audio_reverse_svar);
}

function playPrompt() { playChain(getInitialSources()); }
function playAnswer() { playChain(getAnswerSources()); }

// === DATA + UI ===

async function loadData() {
  try {
    const res = await fetch('begrepp-data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    data = json;
    if (!data.subjects || !data.subjects.length) {
      throw new Error('Inga subjects i datafilen');
    }
    if (data.version !== 2) {
      console.warn('Begrepp-data har oväntad version:', data.version, '— förväntade 2');
    }
    renderSubjectPicker();
  } catch (err) {
    console.error('Kunde inte ladda begrepp-data.json:', err);
    subjectPickerEl.innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <p class="error-msg">Kunde inte ladda data.</p>
        <p class="error-hint">Kontrollera att begrepp-data.json finns.</p>
      </div>`;
  }
}

function getAvailableSubjects() {
  if (!data?.subjects) return [];
  return data.subjects.filter(s => s.archived !== true);
}

function loadAppMode() {
  try {
    const stored = localStorage.getItem(APP_MODE_KEY);
    if (stored === 'paper' || stored === 'app') appMode = stored;
  } catch {}
}

function saveAppMode() {
  try {
    localStorage.setItem(APP_MODE_KEY, appMode);
  } catch {}
}

function setAppMode(mode) {
  appMode = mode;
  saveAppMode();
  appModePaperBtn?.classList.toggle('active', mode === 'paper');
  appModeAppBtn?.classList.toggle('active', mode === 'app');
  appModePaperBtn?.setAttribute('aria-pressed', mode === 'paper' ? 'true' : 'false');
  appModeAppBtn?.setAttribute('aria-pressed', mode === 'app' ? 'true' : 'false');
  // Reset transient state
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback hidden';
  if (guessInput) {
    guessInput.value = '';
    guessInput.disabled = false;
  }
  selfAssessEl.classList.add('hidden');
  revealed = false;
  renderCard();
}

// === SUBJECT PICKER ===

function renderSubjectPicker() {
  cancelChain();
  subjectPickerEl.innerHTML = '';
  subjectPickerEl.classList.remove('hidden');
  cardEl.classList.add('hidden');
  summaryEl.classList.add('hidden');
  backToSubjectsBtn.classList.add('hidden');

  const subjects = getAvailableSubjects();

  const headerEl = document.createElement('div');
  headerEl.className = 'picker-header';
  headerEl.innerHTML = `
    <h2 class="pick-heading">Välj ämne</h2>
    <p class="pick-subheading">Vilket ämne vill du öva på?</p>
  `;
  subjectPickerEl.appendChild(headerEl);

  if (subjects.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<p>Inga ämnen tillgängliga just nu.</p>';
    subjectPickerEl.appendChild(empty);
    return;
  }

  // Om endast ett ämne → auto-select (kid-friendly)
  if (subjects.length === 1) {
    selectSubject(subjects[0].id);
    return;
  }

  const list = document.createElement('div');
  list.className = 'subject-list';
  for (const subj of subjects) {
    const card = document.createElement('button');
    card.className = 'subject-card';
    card.type = 'button';
    card.dataset.subjectId = subj.id;
    if (subj.color) card.style.setProperty('--subject-color', subj.color);
    card.innerHTML = `
      <span class="subject-icon" aria-hidden="true">${escapeHtml(subj.icon || '📚')}</span>
      <span class="subject-info">
        <span class="subject-name">${escapeHtml(subj.name)}</span>
      </span>
      <span class="subject-chevron" aria-hidden="true">›</span>
    `;
    card.addEventListener('click', () => selectSubject(subj.id));
    list.appendChild(card);
  }
  subjectPickerEl.appendChild(list);
}

function selectSubject(subjectId) {
  const subj = data.subjects.find(s => s.id === subjectId);
  if (!subj) return;
  currentSubject = subj;
  try {
    localStorage.setItem(SUBJECT_STORAGE_KEY, subjectId);
  } catch {}
  subjectPickerEl.classList.add('hidden');
  cardEl.classList.remove('hidden');
  backToSubjectsBtn.classList.remove('hidden');

  // Update header
  titleEl.textContent = subj.name;
  if (subtitleEl) subtitleEl.textContent = subj.subtitle || '';
  if (subj.color) {
    document.documentElement.style.setProperty('--primary', subj.color);
  }

  init();
}

function backToSubjects() {
  cancelChain();
  currentSubject = null;
  cardEl.classList.add('hidden');
  summaryEl.classList.add('hidden');
  renderSubjectPicker();
}

// === INSTALL HINT (PWA) ===

function isInstallHintDismissed() {
  try {
    return localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

// === DATA REFRESH (Johanna-pushback 2026-10-02 07:12) ===

async function refreshData() {
  const btn = refreshDataBtn;
  if (!btn) return;
  const label = btn.querySelector('.refresh-label');
  const originalText = label ? label.textContent : '';

  btn.disabled = true;
  btn.classList.add('is-loading');
  if (label) label.textContent = 'Uppdaterar';

  try {
    // 1. Töm SW-cache — säkerställer att gammal data inte serveras
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    // 2. Hämta färsk JSON med cache-bust
    const res = await fetch('begrepp-data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const newJson = await res.json();
    data = newJson;
    // 3. Om i träning — avbryt session och gå tillbaka till picker
    if (currentSubject) {
      cancelChain();
      currentSubject = null;
      cardEl.classList.add('hidden');
      summaryEl.classList.add('hidden');
      backToSubjectsBtn.classList.add('hidden');
    }
    // 4. Rendera om picker
    renderSubjectPicker();
    // 5. Feedback (Klar!)
    btn.classList.remove('is-loading');
    btn.classList.add('is-success');
    if (label) label.textContent = 'Klar!';
    setTimeout(() => {
      btn.classList.remove('is-success');
      if (label) label.textContent = originalText || 'Uppdatera';
    }, 1500);
  } catch (err) {
    console.error('Kunde inte uppdatera data:', err);
    btn.classList.remove('is-loading');
    btn.classList.add('is-error');
    if (label) label.textContent = 'Fel';
    setTimeout(() => {
      btn.classList.remove('is-error');
      if (label) label.textContent = originalText || 'Uppdatera';
    }, 2500);
  } finally {
    btn.disabled = false;
  }
}

// === SESSION LOGIC (per ämne) ===

function init() {
  if (!currentSubject) return;
  // Filtrera bort ev. active:false på enskilda begrepp (bakåtkompatibelt)
  const all = currentSubject.begrepp.filter(b => b.active !== false);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  order = all.map(b => b.id);
  currentIndex = 0;
  masteredThisSession = [];
  sessionRepeats = 0;
  sessionAttempts = [];
  streak = 0;
  totalSpan.textContent = all.length;
  renderProgress();
  updateStreak();
  renderCard();
}

function nextWord() {
  if (currentIndex < order.length - 1) {
    currentIndex++;
    renderCard();
  } else if (currentIndex === order.length - 1) {
    showSummary();
  }
}

function prevWord() {
  if (currentIndex > 0) {
    currentIndex--;
    renderCard();
  }
}

function renderCard() {
  if (!currentSubject) return;
  if (currentIndex >= order.length) {
    showSummary();
    return;
  }
  const id = order[currentIndex];
  currentCard = currentSubject.begrepp.find(b => b.id === id);
  if (!currentCard) {
    currentIndex++;
    renderCard();
    return;
  }

  if (currentMode === 'forward') {
    promptEl.textContent = currentCard.begrepp;
    answerEl.textContent = currentCard.forklaring;
  } else {
    promptEl.textContent = currentCard.forklaring;
    answerEl.textContent = currentCard.begrepp;
  }

  // V5.5: Opt-in bild (emoji eller filnamn) — visas om begrepp.image finns
  if (currentCard.image) {
    imageAreaEl.textContent = currentCard.image;
    imageAreaEl.hidden = false;
  } else {
    imageAreaEl.textContent = '';
    imageAreaEl.hidden = true;
  }

  // Reset state
  answerEl.classList.add('hidden');
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback hidden';
  audioAnswerBtn.classList.add('hidden');
  audioAnswerBtn.disabled = true;
  selfAssessEl.classList.add('hidden');
  if (guessInput) {
    guessInput.value = '';
    guessInput.disabled = false;
  }
  revealed = false;

  // App-läge är ENDAST tillgängligt i reverse (forward har långa svar)
  const useAppMode = (currentMode === 'reverse' && appMode === 'app');
  if (inputRow) inputRow.hidden = !useAppMode;
  revealBtn.classList.toggle('hidden', useAppMode);

  // Audio-knappar: visa bara om audio finns för aktuellt kort
  if (audioButtonsEl) audioButtonsEl.classList.toggle('hidden', !hasAudioForCurrentCard());

  currentSpan.textContent = currentIndex + 1;

  // Nav-knappar
  if (prevBtn) prevBtn.disabled = currentIndex === 0;
  if (nextBtn) nextBtn.disabled = currentIndex >= order.length - 1;

  renderProgress();

  cancelChain();
  if (hasAudioForCurrentCard()) {
    setTimeout(() => playPrompt(), INITIAL_DELAY_MS);
  }

  // Fokusera input i app-läge
  if (useAppMode && guessInput) {
    setTimeout(() => guessInput.focus(), 500);
  }
}

function reveal() {
  if (!currentCard || revealed) return;
  // Reveal är bara pappers-läge; i app-läge används Rätta istället
  if (currentMode === 'reverse' && appMode === 'app') return;
  revealed = true;
  answerEl.classList.remove('hidden');
  revealBtn.classList.add('hidden');
  if (currentCard.audio_svar || currentCard.audio_reverse_svar) {
    audioAnswerBtn.classList.remove('hidden');
    audioAnswerBtn.disabled = false;
  }
  selfAssessEl.classList.remove('hidden');
  cancelChain();
  setTimeout(() => playAnswer(), 0);
}

function normalize(str) {
  return str.toLowerCase().trim();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function buildDiffFeedback(guessText, correctText) {
  let highlightedGuess = '';
  let i = 0;
  while (i < guessText.length && i < correctText.length) {
    if (guessText[i].toLowerCase() === correctText[i].toLowerCase()) {
      highlightedGuess += escapeHtml(guessText[i]);
    } else {
      highlightedGuess += `<span class="wrong-letter">${escapeHtml(guessText[i])}</span>`;
    }
    i++;
  }
  if (guessText.length > correctText.length) {
    highlightedGuess += `<span class="wrong-letter">${escapeHtml(guessText.slice(i))}</span>`;
  } else if (guessText.length < correctText.length) {
    highlightedGuess += `<span class="missing-letter">${escapeHtml(correctText.slice(i))}</span>`;
  }
  return `✗ Inte rätt.<br>Du skrev: <strong>${highlightedGuess}</strong><br>Rätt: <strong>${escapeHtml(correctText)}</strong>`;
}

function checkGuess() {
  if (!currentCard || revealed) return;
  // Bara app-läge reverse
  if (currentMode !== 'reverse' || appMode !== 'app') return;

  const guess = normalize(guessInput.value);
  if (!guess) {
    feedbackEl.textContent = 'Skriv ditt svar först';
    feedbackEl.className = 'feedback feedback-hint';
    return;
  }

  const correct = normalize(currentCard.begrepp);

  if (guess === correct) {
    feedbackEl.innerHTML = `✓ Rätt! <strong>${escapeHtml(currentCard.begrepp)}</strong>`;
    feedbackEl.className = 'feedback feedback-correct';
    guessInput.disabled = true;
    revealed = true;
    masteredThisSession.push(currentCard.id);
    streak++;
    updateStreak();
    saveMastery(currentCard.id, true);
    sessionAttempts.push({ id: currentCard.id, correct: true, mode: currentMode });
    renderProgress();
    setTimeout(() => nextWord(), 800);
  } else {
    feedbackEl.innerHTML = buildDiffFeedback(guessInput.value.trim(), currentCard.begrepp);
    feedbackEl.className = 'feedback feedback-wrong';
    guessInput.disabled = true;
    revealed = true;
    streak = 0;
    updateStreak();
    sessionRepeats++;
    saveMastery(currentCard.id, false);
    sessionAttempts.push({ id: currentCard.id, correct: false, mode: currentMode });
    const wordId = order.splice(currentIndex, 1)[0];
    order.push(wordId);
    renderProgress();
    if (nextBtn) nextBtn.disabled = false;
    if (nextBtn) nextBtn.focus();
  }
}

function selfAssess(correct) {
  if (!currentCard || !revealed) return;
  if (correct) {
    masteredThisSession.push(currentCard.id);
    streak++;
  } else {
    const wordId = order.splice(currentIndex, 1)[0];
    order.push(wordId);
    sessionRepeats++;
    streak = 0;
  }
  updateStreak();
  renderProgress();
  saveMastery(currentCard.id, correct);
  sessionAttempts.push({ id: currentCard.id, correct, mode: currentMode });
  nextWord();
}

function saveMastery(cardId, correct) {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const card = stored[cardId] || { correct: 0, wrong: 0, lastSeen: null };
    if (correct) card.correct++;
    else card.wrong++;
    card.lastSeen = new Date().toISOString();
    stored[cardId] = card;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (err) {
    console.warn('Kunde inte spara mastery:', err);
  }
}

function updateStreak() {
  streakNum.textContent = streak;
  streakCounter.classList.toggle('active', streak > 0);
}

function renderProgress() {
  progressBar.innerHTML = '';
  const masteredSet = new Set(masteredThisSession);
  for (let i = 0; i < order.length; i++) {
    const dot = document.createElement('div');
    dot.className = 'progress-dot';
    if (masteredSet.has(order[i])) dot.classList.add('completed');
    else if (i === currentIndex) dot.classList.add('active');
    progressBar.appendChild(dot);
  }
}

function showSummary() {
  cancelChain();
  cardEl.classList.add('hidden');
  summaryEl.classList.remove('hidden');
  document.getElementById('summaryFirstTry').textContent = masteredThisSession.length;
  document.getElementById('summaryRepeats').textContent = sessionRepeats;
}

function startOver() {
  cardEl.classList.remove('hidden');
  summaryEl.classList.add('hidden');
  init();
}

function setMode(mode) {
  if (currentMode === mode) return;
  currentMode = mode;
  modeForwardBtn.classList.toggle('active', mode === 'forward');
  modeForwardBtn.setAttribute('aria-selected', mode === 'forward');
  modeReverseBtn.classList.toggle('active', mode === 'reverse');
  modeReverseBtn.setAttribute('aria-selected', mode === 'reverse');
  if (paperAppToggle) {
    paperAppToggle.hidden = (mode === 'forward');
  }
  if (mode === 'forward' && appMode === 'app') {
    setAppMode('paper');
    return;
  }
  init();
}

// Event listeners
modeForwardBtn.addEventListener('click', () => setMode('forward'));
modeReverseBtn.addEventListener('click', () => setMode('reverse'));
appModePaperBtn?.addEventListener('click', () => setAppMode('paper'));
appModeAppBtn?.addEventListener('click', () => setAppMode('app'));
revealBtn.addEventListener('click', reveal);
rattBtn.addEventListener('click', () => selfAssess(true));
felBtn.addEventListener('click', () => selfAssess(false));
prevBtn?.addEventListener('click', prevWord);
nextBtn?.addEventListener('click', () => {
  if (!revealed) {
    nextWord();
    return;
  }
  nextWord();
});
startOverBtn.addEventListener('click', startOver);
audioPromptBtn.addEventListener('click', playPrompt);
audioAnswerBtn.addEventListener('click', playAnswer);
dismissInstallBtn?.addEventListener('click', () => {
  installHint.hidden = true;
  try { localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, 'true'); } catch {}
});

// V5: Tillbaka till ämnesväljare
backToSubjectsBtn?.addEventListener('click', backToSubjects);

// V5.3: Uppdatera data-knapp (Johanna-pushback 2026-10-02 07:12)
refreshDataBtn?.addEventListener('click', refreshData);

// Enter i input-fältet → Rätta (app-läge)
guessInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!revealed) checkGuess();
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  // Skippa banner om användaren redan dismissat eller appen är installerad (Johanna 2026-10-02)
  if (isInstallHintDismissed()) return;
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
  e.preventDefault();
  deferredInstallPrompt = e;
  installHint.hidden = false;
  installBtn.hidden = false;
});

installBtn?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') installHint.hidden = true;
  deferredInstallPrompt = null;
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.isContentEditable) {
    return;
  }
  if (e.key === 'Escape') {
    // V5: Escape går tillbaka till ämnesväljaren om vi är i träning
    if (!subjectPickerEl.classList.contains('hidden')) return;
    backToSubjects();
    return;
  }
  if (e.key === ' ' || e.key === 'Enter') {
    if (!revealed) {
      e.preventDefault();
      if (currentMode === 'reverse' && appMode === 'app') {
        checkGuess();
      } else {
        reveal();
      }
    }
  } else if (e.key === 'r' || e.key === 'R') {
    if (revealed) rattBtn.click();
  } else if (e.key === 'f' || e.key === 'F') {
    if (revealed) felBtn.click();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    prevWord();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    nextWord();
  } else if (e.key === '1') {
    modeForwardBtn.click();
  } else if (e.key === '2') {
    modeReverseBtn.click();
  }
});

// Service worker (offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Cache-bust ?v=N på sw.js matchar CACHE_NAME i sw.js — tvingar webbläsaren att
    // hämta ny SW istället för att returnera HTTP-cache. Utan detta kan gamla
    // SW-registreringar ligga kvar i veckor (Johanna-incident 2026-10-02 07:02).
    navigator.serviceWorker.register('sw.js?v=25').catch(err => console.warn('SW registration failed:', err));
  });
}

// Initiera
loadAppMode();
setAppMode(appMode);
if (paperAppToggle) {
  paperAppToggle.hidden = (currentMode === 'forward');
}

loadData();