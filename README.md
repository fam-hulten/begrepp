# Begrepp — Klass 4 Lejonskolan

Träna SO-begrepp (Matematik v.37+) med audio. För Zacharias (åk 4, misstänkt språkstörning).

## Funktioner

- **Två lägen:**
  - **Begrepp → Förklaring** — hör "Förklara ordet X", tänk förklaringen, tryck för att se + höra svaret
  - **Förklaring → Begrepp** — hör "Vilket ord betyder: <förklaring>", gissa ordet, tryck för att se + höra
- **Självbedömning:** ✓ Rätt (tas ur kö) / ✗ Fel (flyttas till sist i kö)
- **Audio:** MiniMax TTS, svensk röst (`Swedish_male_1_v1`), V4-struktur (4 filer per begrepp)
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

## Läxor / versioner

| Datum | Läxa | Begrepp | Anteckning |
|-------|------|---------|------------|
| 2026-09-09 | Samhällskunskap v.37 | 12 SO-begrepp (demokrati, normer, etc.) | V1, V2, V3 splice-experiment |
| 2026-09-16 | Matematik v.37 | 9 matte-begrepp (summa, differens, etc.) | V4 hela-meningar-struktur |

## Datum / Kontext

- Skapad: 2026-09-02 (onsdag morgon)
- Läxor: SO 9 sep → matte 16 sep
- Målgrupp: Zacharias, 10 år, åk 4 Lejonskolan
- Byggd av: Lilly (Johannas EA)

## Viktiga learnings (2026-09-10)

1. **Pre-roll-tystnad:** TTS-källan MiniMax levererar ~164 ms tystnad i början av varje fil. **BATCH-TRIMMA INTE** — det är webbläsarens autoplay-policy som tappar början, inte filen. Fixas med `primeAudio()` i `app.js` (audio/priming.mp3, volym 0).
2. **Splicing:** `cancelChain()` måste pausa + reset `currentTime` på ALLA audios i kedjan — annars fortsätter föregående ljud och spliicar med nästa.
3. **`canplay`-väntan:** Fixar bara "filen är nedladdad", inte "audio context är redo". För autoplay utan user gesture krävs priming.
