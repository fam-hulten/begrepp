# Begrepp — Klass 4 Lejonskolan

Träna SO-begrepp (Samhällskunskap v.37) med audio. För Zacharias (åk 4, misstänkt språkstörning).

## Funktioner

- **Två lägen:**
  - **Begrepp → Förklaring** — läs ordet, tänk förklaringen, tryck för att se + höra svaret
  - **Förklaring → Begrepp** — hör/läs förklaringen, gissa ordet, tryck för att se + höra
- **Självbedömning:** ✓ Rätt (sparas) / ✗ Fel (repeteras i slutet av högen)
- **Audio:** MiniMax TTS, svensk röst (`Swedish_male_1_v1`), 24 filer (12 begrepp + 12 förklaringar)
- **Progress:** streck-räknare, progress dots, session summary
- **PWA:** installable, offline-stöd
- **Privacy:** ingen analytics, inga reklam, LocalStorage för mastery

## Pedagogik

- **Ingen bestraffning** — fel svar = repetera, inte game over
- **Kort session** (5-10 min) — DLD-vänligt
- **Självbedömning** — bygger metacognition
- **Audio prominent** — hörselinlärning för DLD

## Tech-stack

- Vanilla HTML/CSS/JS (inga externa dependencies)
- JSON för data
- MiniMax TTS för audio
- GitHub Pages för hosting
- Service Worker för offline

## Filstruktur

```
begrepp/
├── index.html              # Huvud-UI
├── styles.css              # Styling (amber-tema)
├── app.js                  # Logik (begrepp + Leitner-kö)
├── begrepp-data.json       # 12 begrepp + förklaringar
├── manifest.json           # PWA config
├── sw.js                   # Service worker (offline)
├── audio/                  # 24 MP3-filer (MiniMax TTS)
│   ├── manniskor-begrepp.mp3
│   ├── manniskor-forklaring.mp3
│   └── ...
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── scripts/
│   └── gen_audio.py        # Generera audio (kräver mmx auth)
├── LICENSE
└── README.md
```

## Audio-generering (om filer saknas)

```bash
# Setup auth (en gång)
mmx auth login --api-key "$(cat /tmp/.mmx-key)"

# Generera alla 24 filer
python3 scripts/gen_audio.py

# Bara begrepp
python3 scripts/gen_audio.py --type begrepp

# Dry-run (utan att faktiskt generera)
python3 scripts/gen_audio.py --dry-run
```

## Build / Deploy

```bash
# Lokalt: öppna index.html i webbläsare
# Deploy: push till GitHub Pages (auto-deploy via fam-hulten/begrepp)
```

## V1 scope

- 12 begrepp (Samhällskunskap v.37, onsdag 9 sep)
- 2 lägen (forward + reverse)
- Självbedömning med Leitner-kö
- Audio (24 filer)
- Samma gui som `fam-hulten/glosor` (med amber-tema istället för indigo)

**Utanför V1 scope (framtida iterationer):**
- Match/memory/test spellägen (kommer i V2)
- Kluster-jämförelseläge (kommer i V2)
- Bildstöd med WidgetGen (kommer i V2)
- Adaptive SRS (kommer i V3)

## Datum / Kontext

- Skapad: 2026-09-02 (onsdag morgon)
- Läxa-datum: 2026-09-09 (onsdag)
- Målgrupp: Zacharias, 10 år, åk 4 Lejonskolan
- Byggd av: Lilly (Johannas EA)
