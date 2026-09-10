# WORKFLOW.md — Veckovis uppdatering av nya begrepp

**Syfte:** Steg-för-steg-guide för att lägga in nya begrepp i `begrepp`-appen.
**Målgrupp:** Lilly (primärt), Johanna (backup, kan köra om Lilly är nere).
**Frekvens:** Varje vecka (motsvarande veckans läxa).

---

## Förutsättningar (en gång)

```bash
# 1. Auth till MiniMax (för TTS-generering)
mmx auth login --api-key "$(cat /tmp/.mmx-key)"

# 2. Verifiera att script finns
ls /home/node/.openclaw/repos/begrepp/scripts/
# Förväntat: gen_audio_v4.py, gen_audio_manifest_v4.py, verify_audio_manifest.py

# 3. Verifiera att vi är i rätt repo
cd /home/node/.openclaw/repos/begrepp && git remote -v
# Förväntat: origin = https://github.com/fam-hulten/begrepp.git
```

---

## Steg 1 — Hämta veckans begrepp

**Källa:** Veckans läxa — vanligtvis SO (samhällskunskap) eller matte.

**Exempel (matte v.37):**
- Summa, differens, multiplikation, jämna tal, produkt, udda tal, division, addition, subtraktion

**Kontrollera med Johanna** om oklart vilka begrepp som ska in — veckans läxa ≠ nödvändigtvis appens begrepp.

---

## Steg 2 — Uppdatera `begrepp-data.json`

**Fil:** `begrepp-data.json` (i repot root)

**Struktur per begrepp:**
```json
{
  "id": "summa",
  "begrepp": "Summa",
  "forklaring": "Svaret när man lägger ihop tal med addition. Till exempel: tre plus fyra är sju. Summan är sju.",
  "audio_fraga": "audio/summa-fraga.mp3",
  "audio_svar": "audio/summa-svar.mp3",
  "audio_reverse_fraga": "audio/summa-reverse-fraga.mp3",
  "audio_reverse_svar": "audio/summa-reverse-svar.mp3"
}
```

**Regler:**
- `id` — kebab-case, kort, unikt (t.ex. `jamna-tal`, inte `jämna tal` eller `JamnaTal`)
- `begrepp` — ordet som det står i läroboken (t.ex. "Summa" med stor bokstav)
- `forklaring` — pedagogiskt, DLD-vänligt, kort nog att höras på <10s
  - **Bra:** "Svaret när man lägger ihop tal med addition. Till exempel: tre plus fyra är sju. Summan är sju."
  - **Dåligt:** "Summa är ett matematiskt begrepp som används vid addition" (för abstrakt)
- `audio_*` — sätt paths till `audio/{id}-{typ}.mp3` — genereras i steg 3

**Verifiering innan steg 3:**
```bash
python3 -c "import json; d=json.load(open('begrepp-data.json')); print(f'{len(d[\"begrepp\"])} begrepp')"
```

---

## Steg 3 — Generera audio

**Kör:**
```bash
cd /home/node/.openclaw/repos/begrepp
python3 scripts/gen_audio_v4.py
```

**Förväntad output:**
```
Genererar N filer (4 typer × N begrepp)
Voice:    Swedish_male_1_v1
Model:    speech-2.8-hd
Language: Swedish
...
Resultat: N/N ok, 0/N fail
```

**Om auth-fel:** Se "Felsökning" nedan.

**Verifiering:**
```bash
ls audio/ | grep -v priming | grep -v test | wc -l
# Förväntat: 4 × antal_begrepp (t.ex. 36 för 9 begrepp)
```

**Om bara en typ saknas** (t.ex. en fil försvann):
```bash
python3 scripts/gen_audio_v4.py --type fraga        # bara fraga
python3 scripts/gen_audio_v4.py --type svar         # bara svar
python3 scripts/gen_audio_v4.py --type reverse-fraga # bara reverse-fraga
python3 scripts/gen_audio_v4.py --type reverse-svar  # bara reverse-svar
```

---

## Steg 4 — Generera manifest

**Kör:**
```bash
python3 scripts/gen_audio_manifest_v4.py
```

**Förväntad output:**
```
Manifest written to audio-manifest.json
```

**Verifiering:**
```bash
python3 -c "import json; m=json.load(open('audio-manifest.json')); print(f'{len(m[\"concepts\"])} concepts'); [print(f'  {c[\"id\"]}: {len(c[\"forward_initial\"])}+{len(c[\"forward_reveal\"])}+{len(c[\"reverse_initial\"])}+{len(c[\"reverse_reveal\"])} files') for c in m['concepts']]"
```

---

## Steg 5 — Validera

**Kör:**
```bash
python3 scripts/verify_audio_manifest.py
```

**Förväntad output:**
```
✓ All 36 audio files exist (9 concepts × 4 + priming)
✓ Manifest matches disk
```

**Om fel:** Listar saknade filer. Generera dem med `gen_audio_v4.py --type <typ>`.

---

## Steg 6 — Test lokalt (valfritt men rekommenderat)

**Öppna i webbläsare:**
```bash
xdg-open index.html  # eller öppna manuellt
```

**Testa:**
1. Första instruktionen spelas från början (audio priming fungerar)
2. Begrepp → Förklaring-läge: alla nya begrepp hörs
3. Förklaring → Begrepp-läge: alla hörs
4. Rätt/Fel-knappar ger splicing-fritt ljud

---

## Steg 7 — Commit + Deploy

```bash
git add -A
git commit -m "Lägga till begrepp v.NN: <ämne> (<antal> begrepp)

- <begrepp1>, <begrepp2>, ...
- Genererade <antal × 4> audio-filer
- Manifest uppdaterat"
git push origin main
```

**Deploy:** GitHub Pages auto-deployer inom ~30s.

**Verifiering:**
```bash
# Vänta 30s, sedan:
curl -s https://fam-hulten.github.io/begrepp/begrepp-data.json | python3 -m json.tool | head -20
```

---

## Felsökning

### `mmx auth` fail: "Token expired"
```bash
mmx auth login --api-key "$(cat /tmp/.mmx-key)"
```

### `silencedetect` visar pre-roll-tystnad på filer
**GÖR INGET.** ~164 ms pre-roll är normalt för MiniMax TTS. Det är webbläsarens autoplay-policy som tappar början, INTE filen. Fixat med `primeAudio()` i `app.js` (audio/priming.mp3).

### Splicing/dubbel-ljud vid Nästa/Rätt-klick
**Redan fixat i `cancelChain()` (commit 2a758a6).** Om problemet återkommer: kolla att `cancelChain()` pausar + reset:ar `currentTime` på alla audios.

### Första instruktionen tappar början
**Redan fixat med priming (commit 98eacf4).** Om problemet återkommer: kolla att `audio/priming.mp3` finns i repot.

### `verify_audio_manifest.py` rapporterar saknade filer
Generera dem med rätt `--type`-flagga (se steg 3).

---

## Checklista inför varje vecka

- [ ] Steg 1: Vilka begrepp? (Kontrollera med Johanna)
- [ ] Steg 2: Uppdatera `begrepp-data.json`
- [ ] Steg 3: Generera audio
- [ ] Steg 4: Generera manifest
- [ ] Steg 5: Validera
- [ ] Steg 6: Test lokalt (om tid)
- [ ] Steg 7: Commit + push
- [ ] Verifiera live: https://fam-hulten.github.io/begrepp/
- [ ] Logga i `memory/YYYY-MM-DD.md`
- [ ] Meddela Johanna att nya begrepp är live

---

## Relaterade filer

- `README.md` — Översikt, tech-stack, deployment
- `app.js` — Klientlogik (playChain, cancelChain, primeAudio)
- `sw.js` — Service worker (offline-stöd, cache-version)
- `scripts/gen_audio_v4.py` — Audio-generering
- `scripts/gen_audio_manifest_v4.py` — Manifest-generering
- `scripts/verify_audio_manifest.py` — Manifest-validering
- `begrepp-data.json` — Begreppsdata (källa)

---

**Senast uppdaterad:** 2026-09-10 (efter Johannas fråga #15228 om steg-för-steg-guide)
