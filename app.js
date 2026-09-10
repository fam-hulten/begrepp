// Begrepp — PWA V3.9 (playChain)
// Laddar begrepp-data.json, presenterar 12 SO-begrepp med audio för recall-träning.
// Läge 1 (forward): Nytt kort → auto-spela "Förklara ordet" + "#<ord>" → användaren tänker → tryck → visa + spela "#<ord> är <förklaring>"
// Läge 2 (reverse): Nytt kort → auto-spela "Vilket ord kan förklaras såhär" + "<förklaring>" → användaren gissar → tryck → visa + spela "#<ord>"
// Efter reveal: ✓ Rätt (tas ur kö) / ✗ Fel (flyttas till sist i kö)
// Session klar när kön är tom. Cross-session mastery sparas i LocalStorage.
// V3.9 (2026-09-07, Johanna-direktiv): playChain för fler-fils-sekvenser — NY Audio() per fil,
//   onended → nästa. Robust mot auto-play-block (webbläsare tillåter efter första user-gesture).

const STORAGE_KEY = 'begrepp-mastery-v3';
const SW_VERSION = 'begrepp-v13';
const INITIAL_DELAY_MS = 300;

// V4: 4 audio-filer per begrepp (audio_fraga / audio_svar / audio_reverse_fraga / audio_reverse_svar).
// Inga delade filer — varje läge har sin egen korta/långa fråga + svar.

let data = null;
let queue = [];
let masteredThisSession = [];
let sessionRepeats = 0;
let sessionAttempts = [];
let currentCard = null;
let currentMode = 'forward';
let revealed = false;
let activeChain = null; // för att kunna avbryta en pågående kedja

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

// --- AUDIO ENGINE (V3.9 playChain) ---

function cancelChain() {
  if (activeChain) {
    activeChain.cancelled = true;
    activeChain = null;
  }
}

/**
 * Spela en sekvens av MP3-filer i kedja.
 * - NY Audio()-instans per fil (ingen delad state, ingen race condition).
 * - onended → nästa fil. onerror → nästa fil (kedjan fortsätter).
 * - play().catch() hanterar auto-play-block gracefullt.
 * - Avbryter automatiskt föregående kedja om en ny startar.
 */
function playChain(sources) {
  cancelChain();
  if (!sources || sources.length === 0) return;

  const chain = { cancelled: false, audios: [] };
  activeChain = chain;

  // Preloada ALLA filer parallellt — eliminerar nätverks-/decode-paus mellan filer.
  // När föregående fil ended är nästa redan buffrad → play() startar direkt.
  sources.forEach(src => {
    const a = new Audio();
    a.preload = 'auto';
    a.src = src;
    try { a.load(); } catch (e) { /* ignore — play() kommer att fånga felet */ }
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
    audio.onerror = (e) => {
      console.warn('[playChain] load failed:', audio.src, e && e.message);
      playNext();
    };
    audio.play().catch(err => {
      console.warn('[playChain] play() rejected:', audio.src, err && err.message);
      // Auto-play block eller nätverksfel — kedjan fortsätter till nästa fil.
      playNext();
    });
  }

  // Vänta på att FÖRSTA filen har tillräckligt med data (canplay) innan play().
  // Fixar "första gången tappar början" — utan detta kan play() starta innan
  // filen är nedladdad och början klipps av. readyState >= 3 = HAVE_FUTURE_DATA.
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
    // Fallback: om eventlyssnarna inte fire:ar (t.ex. redan cachad men readyState felrapporterad)
    setTimeout(startWhenReady, 1500);
  }
}

// Sekvens-byggare (per Johannas design 2026-09-03 09:21)

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

// Användar-knappar (replay)

function playPrompt() {
  playChain(getInitialSources());
}

function playAnswer() {
  playChain(getAnswerSources());
}

// --- DATA + UI ---

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

  // Auto-spela INSTRUKTION + specifik audio efter 300ms (båda moder)
  cancelChain();
  setTimeout(() => playPrompt(), INITIAL_DELAY_MS);
}

function reveal() {
  if (!currentCard || revealed) return;
  revealed = true;
  answerEl.classList.remove('hidden');
  revealBtn.classList.add('hidden');
  audioAnswerBtn.classList.remove('hidden');
  audioAnswerBtn.disabled = false;
  selfAssessEl.classList.remove('hidden');
  // Spela SVAR-sekvens
  cancelChain();
  setTimeout(() => playAnswer(), 0);
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
  init();
}

// Event listeners
modeForwardBtn.addEventListener('click', () => setMode('forward'));
modeReverseBtn.addEventListener('click', () => setMode('reverse'));
revealBtn.addEventListener('click', reveal);
rattBtn.addEventListener('click', () => selfAssess(true));
felBtn.addEventListener('click', () => selfAssess(false));
startOverBtn.addEventListener('click', startOver);
audioPromptBtn.addEventListener('click', playPrompt);
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
