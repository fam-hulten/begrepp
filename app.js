// Begrepp — PWA V3.8 (DRY + generella instruktions-MP3 + "är"-länk)
// Laddar begrepp-data.json, presenterar 12 SO-begrepp med audio för recall-träning.
// Läge 1 (forward): Visa begrepp på skärmen + auto-spela INSTR_FORWARD + `#<ord>` → användaren tänker/säger förklaring → tryck → visa + läs upp `#<ord>` + AUDIO_AR + `<förklaring>` (3 filer)
// Läge 2 (reverse): Visa förklaring på skärmen + auto-spela INSTR_REVERSE + `<förklaring>` → användaren gissar ord → tryck → visa + läs upp `#<ord>`
// Efter reveal: ✓ Rätt (tas ur kö) / ✗ Fel (flyttas till sist i kö)
// Session klar när kön är tom. Cross-session mastery sparas i LocalStorage.
// V3.8 (2026-09-03, Johanna-direktiv): playTwoFiles/playThreeFiles-arkitektur:
//   - Generella instruktions-MP3 (instr-forward, instr-reverse) delas av alla 12 begrepp
//   - Generell "är"-MP3 (audio-ar) delas av alla 12 begrepp (forward reveal)
//   - 12 × audio_begrepp (`#<ord>`) + 12 × audio_forklaring (BARA förklaringen)

const STORAGE_KEY = 'begrepp-mastery-v3';
const SW_VERSION = 'begrepp-v3';
const ANSWER_PAUSE_MS = 0; // 0ms paus — DRY: separata filer spelas direkt i sekvens

let data = null;
let queue = [];
let masteredThisSession = [];
let sessionRepeats = 0;
let sessionAttempts = [];
let currentCard = null;
let currentMode = 'forward';
let revealed = false;

const audio = new Audio();
audio.preload = 'auto';

const cardEl = document.getElementById('card');
const promptEl = document.getElementById('prompt');
const answerEl = document.getElementById('answer');
const audioPromptBtn = document.getElementById('audioPromptBtn');
const audioAnswerBtn = document.getElementById('audioAnswerBtn');
const revealBtn = document.getElementById('revealBtn');
const selfAssessEl = document.getElementById('selfAssess');
const rattBtn = document.getElementById('rattBtn');
const felBtn = document.getElementById('felBtn');
const progressBar = document.getElementById('progressBar');
const currentSpan = document.getElementById('current');
const totalSpan = document.getElementById('total');
const streakCounter = document.getElementById('streakCounter');
const streakNum = document.getElementById('streakNum');
const modeForwardBtn = document.getElementById('modeForwardBtn');
const modeReverseBtn = document.getElementById('modeReverseBtn');
const summaryEl = document.getElementById('summary');
const startOverBtn = document.getElementById('startOverBtn');
const installHint = document.getElementById('installHint');
const installBtn = document.getElementById('installBtn');
const dismissInstallBtn = document.getElementById('dismissInstall');
const titleEl = document.getElementById('title');

let streak = 0;
let deferredInstallPrompt = null;

async function loadData() {
  try {
    const res = await fetch('begrepp-data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    data = json;
    if (!data.begrepp || !data.begrepp.length) throw new Error('Inga begrepp i datafilen');
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

function init() {
  const all = [...data.begrepp];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  queue = all.map(b => b.id);
  masteredThisSession = [];
  sessionRepeats = 0;
  sessionAttempts = [];
  streak = 0;
  totalSpan.textContent = data.begrepp.length;
  renderProgress();
  updateStreak();
  nextCard();
}

function nextCard() {
  if (queue.length === 0) {
    showSummary();
    return;
  }
  const id = queue[0];
  currentCard = data.begrepp.find(b => b.id === id);
  if (!currentCard) {
    queue.shift();
    nextCard();
    return;
  }
  revealed = false;
  renderCard();
}

function renderCard() {
  if (!currentCard) return;
  if (currentMode === 'forward') {
    promptEl.textContent = currentCard.begrepp;
    answerEl.textContent = currentCard.forklaring;
  } else {
    promptEl.textContent = currentCard.forklaring;
    answerEl.textContent = currentCard.begrepp;
  }
  answerEl.classList.add('hidden');
  revealBtn.classList.remove('hidden');
  audioAnswerBtn.classList.add('hidden');
  audioAnswerBtn.disabled = true;
  selfAssessEl.classList.add('hidden');
  currentSpan.textContent = masteredThisSession.length + 1;

  // Auto-spela INITIAL: forward = instr-forward + audio_begrepp, reverse = instr-reverse + audio_forklaring
  setTimeout(() => playInitial(), 300);
}

function getAnswerSrc() {
  if (!currentCard) return null;
  return currentMode === 'forward' ? currentCard.audio_forklaring : currentCard.audio_begrepp;
}

function getBegreppSrc() {
  if (!currentCard) return null;
  return currentCard.audio_begrepp;
}

// playInitial: forward = INSTR_FORWARD + audio_begrepp. reverse = INSTR_REVERSE + audio_forklaring.
function playInitial() {
  if (!currentCard) return;
  const instr = currentMode === 'forward' ? INSTR_FORWARD : INSTR_REVERSE;
  const specific = currentMode === 'forward' ? currentCard.audio_begrepp : currentCard.audio_forklaring;
  playChain([instr, specific]);
}

// playAnswer: forward = audio_begrepp + AUDIO_AR + audio_forklaring (3 filer).
//             reverse = audio_begrepp (1 fil).
function playAnswer() {
  if (!currentCard) return;
  if (currentMode === 'forward') {
    playChain([currentCard.audio_begrepp, AUDIO_AR, currentCard.audio_forklaring]);
  } else {
    playChain([currentCard.audio_begrepp]);
  }
}

// playBegrepp: spela BARA begreppet (används av audioPromptBtn — replay-knappen)
function playBegrepp() {
  const src = getBegreppSrc();
  if (!src) return;
  playChain([src]);
}

// playChain: spela en sekvens av MP3-filer med NY Audio()-instans per fil.
// Inga delade audio.onended-state. Robust mot race conditions och auto-play.
let currentChainId = 0;
function playChain(sources) {
  console.log('[playChain] called with', sources);
  if (!sources || sources.length === 0) return;
  // Inkrementera kedje-ID — äldre kedjor ignorar sina onended (förhindrar cross-chain-spöke)
  const chainId = ++currentChainId;
  let i = 0;
  const playNext = () => {
    if (chainId !== currentChainId) return; // äldre kedja, ignorera
    if (i >= sources.length) return;
    const src = sources[i];
    i++;
    console.log('[playChain] step', i, 'src:', src);
    const a = new Audio(src);
    a.onended = () => { console.log('[playChain] ended step', i); playNext(); };
    a.onerror = (e) => console.warn('[playChain] audio error step', i, e);
    a.play().then(() => console.log('[playChain] playing step', i)).catch(err => console.warn(`[playChain] play failed step ${i}:`, err));
  };
  playNext();
}

function reveal() {
  if (!currentCard || revealed) return;
  revealed = true;
  answerEl.classList.remove('hidden');
  revealBtn.classList.add('hidden');
  audioAnswerBtn.classList.remove('hidden');
  audioAnswerBtn.disabled = false;
  selfAssessEl.classList.remove('hidden');
  // Spela SVAR efter 0.5s paus (Johanna-direktiv)
  setTimeout(() => playAnswer(), ANSWER_PAUSE_MS);
}

function selfAssess(correct) {
  if (!currentCard || !revealed) return;
  if (correct) {
    queue.shift();
    masteredThisSession.push(currentCard.id);
    streak++;
  } else {
    const cardId = queue.shift();
    queue.push(cardId);
    sessionRepeats++;
    streak = 0;
  }
  sessionAttempts.push({ id: currentCard.id, correct, mode: currentMode });
  saveMastery(currentCard.id, correct);
  renderProgress();
  updateStreak();
  nextCard();
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
  for (let i = 0; i < data.begrepp.length; i++) {
    const dot = document.createElement('div');
    dot.className = 'progress-dot';
    if (i < masteredThisSession.length) dot.classList.add('completed');
    else if (i === masteredThisSession.length) dot.classList.add('active');
    progressBar.appendChild(dot);
  }
}

function showSummary() {
  cardEl.classList.add('hidden');
  summaryEl.classList.remove('hidden');
  document.getElementById('summaryFirstTry').textContent = masteredThisSession.length;
  document.getElementById('summaryRepeats').textContent = sessionRepeats;
  audio.pause();
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
  init();
}

// Event listeners
modeForwardBtn.addEventListener('click', () => setMode('forward'));
modeReverseBtn.addEventListener('click', () => setMode('reverse'));
revealBtn.addEventListener('click', reveal);
rattBtn.addEventListener('click', () => selfAssess(true));
felBtn.addEventListener('click', () => selfAssess(false));
startOverBtn.addEventListener('click', startOver);
audioPromptBtn.addEventListener('click', playInitial);
audioAnswerBtn.addEventListener('click', playAnswer);
dismissInstallBtn?.addEventListener('click', () => installHint.hidden = true);

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
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === ' ' || e.key === 'Enter') {
    if (!revealed) {
      e.preventDefault();
      reveal();
    }
  } else if (e.key === 'r' || e.key === 'R') {
    if (revealed) rattBtn.click();
  } else if (e.key === 'f' || e.key === 'F') {
    if (revealed) felBtn.click();
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

loadData();
