# Begrepp — Klass 4 Lejonskolan

Träna begrepp (Historia, NO, Matte, …) med audio. För Zacharias (åk 4, misstänkt språkstörning).

## Funktioner

- **Två huvudlägen:**
  - **Begrepp → Förklaring** (forward) — hör "Förklara ordet X", tänk förklaringen, tryck för att se + höra svaret
  - **Förklaring → Begrepp** (reverse) — hör "Vilket ord betyder: <förklaring>", gissa ordet, tryck för att se + höra
- **Papper-läge (default, båda riktningar):** Visa svaret → reveal + self-mark ✓ Rätt / ✗ Fel
- **App-läge (bara reverse, valfritt):** Skriv in begreppet, Rätta jämför mot facit med bokstav-för-bokstav diff. Rätt → ✓ Rät, auto-advance. Fel → ✗ Inte rätt, manuell Nästa, ordet flyttas till slutet av listan.
- **← Bak / Nästa → navigation** — alltid synlig, fritt genom listan
- **Självbedömning (papper):** ✓ Rätt (masteras) / ✗ Fel (flyttas till slutet av listan)
- **Audio:** MiniMax TTS, svensk röst (`Swedish_male_1_v1`), V4-struktur (4 filer per begrepp)
- **Mastery-tracking:** sparas i LocalStorage (`begrep…y-v3`) oavsett papper/app-läge
- **Progress:** streck-räknare, progress dots, session summary
- **PWA:** installable, offline-stöd
- **Privacy:** ingen analytics, inga rekram, LocalStorage för mastery

## Audio-struktur (V4 — hela meningar)

Per begrepp genereras **4 MP3-filer** (Johanna-direktiv 2026-09-10):

| Fil | Innehåll | Speed | Röst |
|-----|----------|-------|------|
| `{id}-fraga.mp3` | `Förklara ordet {ord.lower()}` | 0.85 | Swedish_male_1_v1 |
| `{id}-svar.mp3` | `{ord} är {definition}` | 1.0 | Swedish_male_1_v1 |
| `{id}-reverse-fraga.mp3` | `Vilket ord betyder: {definition.lower()}` | 1.0 | Swedish_male_1_v1 |
| `{id}-reverse-svar.mp3` | `{ord}` | 1.0 | Swedish_male_1_v1 |

Plus `audio/priming.mp3` — 216 ms tystnad för audio-context-priming (webbläsarens autoplay-policy). Genererad med ffmpeg.

**Modell:** `speech-2.8-hd`  
**Språk:** Swedish

## Pedagogik

- **Ingen bestraffning** — fel svar = repetera, inte game over
- **Kort session** (5-10 min) — DLD-vänligt
- **Självbedömning** — bygger metacognition
- **Audio prominent** — hörselinlärning för DLD

## Tech-stack

- Vanilla HTML/CSS/JS (inga externa dependencies)
- JSON för data + manifest
- MiniMax TTS för audio
- GitHub Pages för hosting
- Service Worker för offline

## Filstruktur

```
begrepp/
├── index.html                      # Huvud-UI
├── styles.css                      # Styling (amber-tema)
├── app.js                          # Logik (begrepp + Leitner-kö)
├── begrepp-data.json               # 9 begrepp + förklaringar (matematik)
├── audio-manifest.json             # Genererat manifest (4 filer/begrepp)
├── manifest.json                   # PWA config
├── sw.js                           # Service worker (offline)
├── audio/                          # 37 MP3-filer (9×4 + priming)
│   ├── priming.mp3
│   ├── addition-fraga.mp3
│   ├── addition-svar.mp3
│   ├── addition-reverse-fraga.mp3
│   ├── addition-reverse-svar.mp3
│   └── ...
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── scripts/
│   ├── gen_audio_v4.py             # Generera audio (kräver mmx auth)
│   ├── gen_audio_manifest_v4.py    # Generera audio-manifest.json
│   └── verify_audio_manifest.py    # Verifiera manifest ↔ filer
├── LICENSE
└── README.md
```

## Audio-generering (om filer saknas)

```bash
# 1. Setup auth (en gång)
mmx auth login --api-key "$(cat /tmp/.mmx-key)"

# 2. Generera ALLA 4 filtyper för ALLA begrepp
python3 scripts/gen_audio_v4.py

# 3. Generera manifest från begrepp-data.json
python3 scripts/gen_audio_manifest_v4.py

# Bara en typ (t.ex. om en fil försvunnit)
python3 scripts/gen_audio_v4.py --type fraga
python3 scripts/gen_audio_v4.py --type svar
python3 scripts/gen_audio_v4.py --type reverse-fraga
python3 scripts/gen_audio_v4.py --type reverse-svar

# Dry-run (utan att faktiskt generera — visar vad som WOULD göras)
python3 scripts/gen_audio_v4.py --dry-run  # INGEN dry-run-flagga i V4 — använd --type för selektiv körning
```

## Manifest-validering

```bash
# Verifiera att alla manifest-filer faktiskt finns på disk
python3 scripts/verify_audio_manifest.py
```

## Veckovis uppdatering

Se **[WORKFLOW.md](WORKFLOW.md)** för steg-för-steg-guide:
1. Uppdatera `begrepp-data.json`
2. Generera audio (`gen_audio_v4.py`)
3. Generera manifest (`gen_audio_manifest_v4.py`)
4. Validera (`verify_audio_manifest.py`)
5. Test lokalt
6. Commit + push

## Build / Deploy

```bash
# Lokalt: öppna index.html i webbläsare
# Deploy: push till GitHub Pages (auto-deploy via fam-hulten/begrepp)
```

## V5 Arkitektur — multi-subject (2026-10-02)

**Bakgrund:** Zacharias har läxa i flera ämnen samtidigt (Historia, NO, …) — behöver kunna växla mellan ämnen i appen. Samma ämne kan ha olika träningslägen (per JSON-deklarativ `modes`-array).

**Datalayout (`begrepp-data.json`):**

```json
{
  "version": 2,
  "subjects": [
    {
      "id": "historia",
      "name": "Historia",
      "subtitle": "Vikingatid v.40",
      "icon": "📜",
      "color": "#b45309",
      "modes": ["forward", "reverse"],
      "begrepp": [
        { "id": "vikingatag", "begrepp": "Vikingatåg", "forklaring": "…", "audio_*": "…" }
      ]
    },
    {
      "id": "no",
      "name": "NO",
      "subtitle": "Biologi, kemi, fysik",
      "icon": "🌿",
      "color": "#16a34a",
      "modes": ["forward", "reverse"],
      "begrepp": [ /* … */ ]
    },
    {
      "id": "matte",
      "name": "Matte",
      "archived": true,
      "modes": ["forward", "reverse"],
      "begrepp": [ /* … */ ]
    }
  ]
}
```

**Per-ämne-fält:**
- `id` (krävs) — kebab-case, unikt. Använd som localStorage-nyckel + DOM-id.
- `name` (krävs) — visningsnamn (t.ex. "Historia", "NO").
- `subtitle` (valfri) — kort kontext under headern (t.ex. "Vikingatid v.40").
- `icon` (valfri) — emoji på väljarkortet. Default: 📚.
- `color` (valfri) — primärfärg för ämnet (CSS `--primary`). Default: amber.
- `modes` (krävs) — array av `"forward"`, `"reverse"`, eller framtida `"multipleChoice"`, `"imageBased"`.
- `archived` (valfri, default false) — visas inte i väljaren.
- `begrepp[]` (krävs) — array av begrepp-objekt.

**Per-begrepp-fält (oförändrat från V4):**
- `id` (krävs) — kebab-case, globalt unikt över alla ämnen (används i localStorage-mastery).
- `begrepp` (krävs) — ordet.
- `forklaring` (krävs) — definition/förklaring.
- `audio_fraga`, `audio_svar`, `audio_reverse_fraga`, `audio_reverse_svar` (valfria) — paths till MP3-filer. Om saknas för aktuellt läge döljs audio-knapparna.

**App-flöde (V5):**
1. Första skärm: ämnesväljare (lista över icke-arkiverade ämnen).
2. Klick på ämneskort → `selectSubject(id)` → laddar ämnets begrepp, byter header + primärfärg, startar session.
3. Träning som förut (forward/reverse, papper/app-läge, Leitner-kö).
4. `← Ämnen` (eller `Esc`) → tillbaka till väljaren.

**Lokal persistence (V5):**
- `begrepp-mastery-v3` (mastery per begrepp-ID: `{correct, wrong, lastSeen}`) — oförändrad från V4. ID är globalt unikt över ämnen så mastery delas per kort (oavsett ämne).
- `***` (paper/app-läge) — oförändrad från V4.
- `begrepp-last-subject-v5` (senast valda ämnes-id) — för PWA-install: återöppnas direkt i senast tränade ämne.

**Backward-kompatibilitet:**
- localStorage-mastery från V4 läses in orörd (samma nyckel, samma struktur).
- `modes`-array är deklarativ per ämne — kan utökas utan app.js-ändringar.
- Per-begrepp `audio_*`-fält är valfria — ämnen utan audio fungerar i visuellt läge (audio-knappar döljs).
- `active: false` per begrepp respekteras fortfarande (bakåtkompatibelt, används i matte-arkivet).

**Skillnad mot tidigare versioner:**
- V1–V4: en JSON-array `begrepp[]` — ett ämne implicit.
- V5: `subjects[]` med per-ämne-begrepp, modes, färg, ikon, archive-stöd.

**Lägg till nytt ämne:**
1. Öppna `begrepp-data.json`.
2. Lägg till objekt i `subjects[]` med unik `id`, `name`, `modes`, `begrepp[]`.
3. Valfritt: sätt `icon`, `color`, `subtitle` för visuell identitet.
4. Generera audio för begreppen (`scripts/gen_audio_v4.py` — funkar oförändrat).
5. Commit + push.

## V4 Arkitektur — mode-toggle + prev/next + app-läge (2026-10-01)

**Bakgrund:** Samma mönster som `fam-hulten/glosor` v6+v7 — konsistent UX i tre appar (glosor, begrepp, rättstavning). Johanna ville ha input-fält + auto-advance i reverse-läget (aktiv återgivning slår passiv reveal pedagogiskt). Forward-läget har långa svar (förklaringar) så app-läge är inte meningsfullt där.

**Tekniska ändringar:**

- **HTML (`index.html`):**
  - Paper/app-mode-toggle infogad i headern efter forward/reverse-toggle: `<div class="mode-toggle paper-app-toggle" id="paperAppToggle" hidden>` med `appModePaperBtn` / `appModeAppBtn`. Initialt gömd (visas bara i reverse).
  - Input-row återinförd i `.card` efter `audio-buttons`: `<div class="input-row" id="inputRow" hidden>` med `<input id="guessInput">` (`hidden`-attribut = döljd i papper-läge och forward).
  - Feedback-div infogad efter `audio-buttons` / före `self-assess`: `<div class="feedback hidden" id="feedback">` — visar ✓/✗ med diff i app-läge.
  - Nav-knappar tillagda efter `self-assess`: `<div class="nav">` med `prevBtn` (`← Bak`) + `nextBtn` (`Nästa →`, primary-next-styling).
  - Kbd-hint utökad med `←` / `→` navigera + `Enter` rätta.
  - Cache-bust `?v=2` → `?v=3`.
- **JS (`app.js`):**
  - Datamodell ändrad: `queue[]` + `nextCard()` → `order[]` + `currentIndex` + `renderCard()`. `order` shufflas en gång i `init()`, fel-ord flyttas till slutet via `order.splice(currentIndex, 1)` + `order.push(wordId)`.
  - Nya state: `let appMode = 'paper'` + `const APP_MODE_KEY` (localStorage-persistens).
  - Nya funktioner: `loadAppMode()`, `saveAppMode()`, `setAppMode(mode)` — uppdaterar UI, visar/dölj input/reveal.
  - Nya navigation: `prevWord()` / `nextWord()` — justerar currentIndex, anropar renderCard().
  - `renderCard()` hanterar fyra kombinationer (forward/reverse × papper/app):
    - **Forward + papper:** prompt = begrepp, revealBtn synlig, input gömd.
    - **Reverse + papper:** prompt = förklaring, revealBtn synlig, input gömd.
    - **Reverse + app:** prompt = förklaring, input synlig, revealBtn gömd.
    - **Forward + app:** (auto-återställs till papper om man byter riktning medan man är i app-läge).
  - `reveal()` blockerad i app-läge (return tidigt om `currentMode === 'reverse' && appMode === 'app'`).
  - Ny `checkGuess()` — ENDAST för reverse + app-läge:
    - Input tomt → feedback "Skriv ditt svar först".
    - Rätt (`normalize(guess) === normalize(begrepp)`): feedback "✓ Rätt!", `saveMastery(true)`, `masteredThisSession.push`, `setTimeout(nextWord, 800)`.
    - Fel: feedback med `buildDiffFeedback` (rättstavning-mönster), `saveMastery(false)`, `sessionRepeats++`, ordet flyttas till slutet, `nextBtn.focus()`.
  - `selfAssess(correct)` används BARA i papper-läge (app-läge använder `checkGuess()` direkt). Mastery-trackning sparas i båda.
  - `renderProgress()` använder `Set(masteredThisSession)` för completed dots (så fel-ord som flyttats till slutet inte visar grön prick).
  - `setMode(mode)` uppdaterar paper-app-toggle visibility: gömd i forward, synlig i reverse. Om man byter till forward och är i app-läge → auto-återställ till papper.
  - Tangentbord: ArrowLeft/ArrowRight för prev/next (skippar om target är INPUT). Enter i input → `checkGuess()`. Mellanslag/Enter globalt → `reveal()` (papper) eller `checkGuess()` (app-läge om input har värde).
- **CSS (`styles.css`):**
  - `.paper-app-toggle` + `.paper-app-toggle[hidden]` — mindre variant av forward/reverse-toggle.
  - `.input-row` + `.guess-input` (focus-ring primary-orange, dark mode-anpassad).
  - `.feedback` + `.feedback-correct` / `.feedback-wrong` / `.feedback-hint` (samma mönster som glosor).
  - `.wrong-letter` + `.missing-letter` (bokstav-för-bokstav diff-markering).
  - `.nav` + `.primary-next` (grid 1fr 2fr, prominent Nästa-knapp).
  - 480px media query: `.nav` margin tightare, `.primary-next` mindre, `.guess-input` fontstorlek ned, `.paper-app-toggle .mode-btn` mindre.
  - Dark mode: `.guess-input` mörk bakgrund, `.paper-app-toggle .mode-btn` transparent bakgrund.

**Skillnad mot rättstavning/glosor:**

- Rättstavning har forward-mode-toggle men ingen app/papper-toggle (single flow per mode).
- Glosor har mode-toggle som alltid syns (eftersom båda lägen passar input — SV→EN).
- Begrepp har paper/app-toggle som BARA syns i reverse (forward-svar för långa för input).

**Backward-kompatibilitet:**

- `STORAGE_KEY = 'begrep…y-v3'` oförändrad — mastery-data från tidigare sessioner läses in korrekt.
- `APP_MODE_KEY` ny — default 'paper' om nyckeln saknas (bryter inget för användare som bara kör papper-läge).
- `setMode('forward')` återställer appMode till 'paper' om det var 'app' (användare hamnar inte i app-läge i forward).

**Läge-persistens (V4):**

- `begrep…y-v3` (mastery per begrepp-ID: `{correct, wrong, lastSeen}`) — befintlig, oförändrad.
- `***` (paper/app-läge) — ny, värde 'paper' eller 'app'.

---

## V1 scope (ursprunglig)

- 9 begrepp (Matematik v.37, addition till subtraktion)
- 2 lägen (forward + reverse)
- Självbedömning med Leitner-kö
- Audio (4 filer per begrepp = 36 + 1 priming)
- Samma gui som `fam-hulten/glosor` (med amber-tema istället för indigo)

**Utanför V1 scope (framtida iterationer):**
- Match/memory/test spellägen (kommer i V2)
- Kluster-jämförelseläge (kommer i V2)
- Bildstöd med WidgetGen (kommer i V2)
- Adaptive SRS (kommer i V3)
- Mode-toggle + app-läge (kommer i V4) ← **LEVERERAT 2026-10-01**

## Läxor / versioner

| Datum | Läxa | Begrepp | Anteckning |
|-------|------|---------|------------|
| 2026-09-09 | Samhällskunskap v.37 | 12 SO-begrepp (demokrati, normer, etc.) | V1, V2, V3 splice-experiment |
| 2026-09-16 | Matematik v.37 | 9 matte-begrepp (summa, differens, etc.) | V4 hela-meningar-struktur |
| 2026-10-01 | (UI-förbättring) | (oförändrat) | V4.1 mode-toggle (papper/app) + ← Bak / Nästa → + app-läge reverse (samma mönster som `fam-hulten/glosor` v6+v7). Konsistent UX i tre appar (glosor, begrepp, rättstavning). |

## Datum / Kontext

- Skapad: 2026-09-02 (onsdag morgon)
- Läxor: SO 9 sep → matte 16 sep
- Målgrupp: Zacharias, 10 år, åk 4 Lejonskolan
- Byggd av: Lilly (Johannas EA)

## Viktiga learnings (2026-09-10)

1. **Pre-roll-tystnad:** TTS-källan MiniMax levererar ~164 ms tystnad i början av varje fil. **BATCH-TRIMMA INTE** — det är webbläsarens autoplay-policy som tappar början, inte filen. Fixas med `primeAudio()` i `app.js` (audio/priming.mp3, volym 0).
2. **Splicing:** `cancelChain()` måste pausa + reset `currentTime` på ALLA audios i kedjan — annars fortsätter föregående ljud och spliicar med nästa.
3. **`canplay`-väntan:** Fixar bara "filen är nedladdad", inte "audio context är redo". För autoplay utan user gesture krävs priming.
