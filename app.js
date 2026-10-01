// Begrepp — PWA V4 (mode-toggle + prev/next + app-läge för reverse)
//
// Läge:
//   • Forward (Begrepp → Förklaring): reading explanation — INGET app-läge.
//   • Reverse (Förklaring → Begrepp): recall begreppet — app-läge möjligt.
//
// App-läge (bara reverse):
//   • Input + Rätta jämför mot begreppet.
//   • Rätt → ✓ Rät!, auto-advance ~0.8s, saveMastery(true).
//   • Fel → ✗ Inte rätt med diff, [Nästa →] manuell, saveMastery(false), ordet till slutet.
//
// Papper-läge (båda riktningar):
//   • Befintligt flöde: Visa svaret → reveal + self-mark.
//
// Navigation: ← Bak / Nästa → fritt genom listan. Rätta påverkar listan oavsett position.

const STORAGE_KEY = 'begrepp-mastery-v3';
const APP_MODE_KEY = 'begrepp-app-mode';

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

let data = null;
let order = [];              // dynamisk ordning (shufflas en gång, fel-ord flyttas till slutet)
let currentIndex = 0;
let masteredThisSession = [];
let sessionRepeats = 0;
let sessionAttempts = [];
let currentCard = null;
let currentMode = 'forward';
let appMode = 'paper';        // 'paper' | 'app' (endast relevant i reverse)
let revealed = false;
let activeChain = null;

const cardEl = document.getElementById('card');
const promptEl = document.getElementById('prompt');
const answerEl = document.getElementById('answer');
const feedbackEl = document.getElementById('feedback');
const audioPromptBtn = document.getElementById('audioPromptBtn');
const audioAnswerBtn = document.getElementById('audioAnswerBtn');
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

let streak = 0;
let deferredInstallPrompt = null;

// --- AUDIO ENGINE (oförändrad från V3.9) ---

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
    return [currentCard.audio_fraga];
  }
  return [currentCard.audio_reverse_fraga];
}

function getAnswerSources() {
  if (!currentCard) return [];
  if (currentMode === 'forward') {
    return [currentCard.audio_svar];
  }
  return [currentCard.audio_reverse_svar];
}

function playPrompt() { playChain(getInitialSources()); }
function playAnswer() { playChain(getAnswerSources()); }

// --- DATA + UI ---

async function loadData() {
  try {
    const res = await fetch('begrepp-data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    data = json;
    if (!data.begrepp || !data.begrepp.length) throw new Error('Inga begrepp i datafilen');
    data.begrepp = data.begrepp.filter(b => b.active !== false);
    if (data.meta?.title) titleEl.textContent = data.meta.title;
    init();
  } catch (err) {
    console.error('Kunde inte ladda begrepp-data.json:', err);
    promptEl.textContent = '⚠️';
    answerEl.textContent = 'Kunde inte ladda data. Kontrollera att begrepp-data.json finns.';
    answerEl.classList.remove('hidden');
    revealBtn.disabled = true;
  }
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

function init() {
  const all = [...data.begrepp];
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
  totalSpan.textContent = data.begrepp.length;
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
  if (currentIndex >= order.length) {
    showSummary();
    return;
  }
  const id = order[currentIndex];
  currentCard = data.begrepp.find(b => b.id === id);
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

  currentSpan.textContent = currentIndex + 1;

  // Nav-knappar
  if (prevBtn) prevBtn.disabled = currentIndex === 0;
  if (nextBtn) nextBtn.disabled = currentIndex >= order.length - 1;

  renderProgress();

  cancelChain();
  setTimeout(() => playPrompt(), INITIAL_DELAY_MS);

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
  audioAnswerBtn.classList.remove('hidden');
  audioAnswerBtn.disabled = false;
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
    // Rätt: ✓ Rät!, auto-advance, saveMastery(true), mastera
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
    // Fel: ✗ Inte rätt med diff, saveMastery(false), ordet till slutet
    feedbackEl.innerHTML = buildDiffFeedback(guessInput.value.trim(), currentCard.begrepp);
    feedbackEl.className = 'feedback feedback-wrong';
    guessInput.disabled = true;
    revealed = true;
    streak = 0;
    updateStreak();
    sessionRepeats++;
    saveMastery(currentCard.id, false);
    sessionAttempts.push({ id: currentCard.id, correct: false, mode: currentMode });
    // Flytta ordet till slutet av listan (currentIndex pekar på nästa)
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
  // Visa/dölj paper/app-toggle beroende på riktning
  if (paperAppToggle) {
    paperAppToggle.hidden = (mode === 'forward');
  }
  // Om vi byter till forward och är i app-läge, återställ till papper
  if (mode === 'forward' && appMode === 'app') {
    setAppMode('paper');
    return;  // setAppMode anropar redan renderCard
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
  // Båda läge + revealed: om i app-läge efter fel är ordet redan flyttat
  nextWord();
});
startOverBtn.addEventListener('click', startOver);
audioPromptBtn.addEventListener('click', playPrompt);
audioAnswerBtn.addEventListener('click', playAnswer);
dismissInstallBtn?.addEventListener('click', () => installHint.hidden = true);

// Enter i input-fältet → Rätta (app-läge)
guessInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!revealed) checkGuess();
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
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
  // Skip om target är input eller contenteditable
  if (e.target.tagName === 'INPUT' || e.target.isContentEditable) {
    // Tillåt piltangenter för cursor-rörelse i input
    return;
  }
  if (e.key === ' ' || e.key === 'Enter') {
    // I app-läge reverse: Enter triggar checkGuess via input-hanteraren
    // Här hanterar vi pappers-läge (reveal) och app-läge (om input ej fokuserad)
    if (!revealed) {
      e.preventDefault();
      if (currentMode === 'reverse' && appMode === 'app') {
        // Försök checkGuess (om guessInput har värde)
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
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed:', err));
  });
}

// Initiera läge från localStorage
loadAppMode();
setAppMode(appMode);  // uppdaterar UI baserat på laddat appMode
// Visa paper/app-toggle om vi startar i reverse
if (paperAppToggle) {
  paperAppToggle.hidden = (currentMode === 'forward');
}

loadData();