#!/usr/bin/env python3
"""
gen_audio.py — Genererar 4 SV audio-filer per begrepp för V3.1-appen

Per begrepp genereras 4 MP3-filer:
  1. {id}-instr-forward.mp3   → "Förklara ordet {begrepp.lower()}"
  2. {id}-forklaring.mp3      → "{begrepp} är {expand_abbrev(forklaring.lower())}"
  3. {id}-instr-reverse.mp3   → "Vilket ord kan förklaras såhär: {forklaring.lower()}"
  4. {id}-begrepp.mp3          → "{begrepp.lower()}"

Voice: Swedish_male_1_v1  (MiniMax T2A)
Model: speech-2.8-hd
Speed: 0.85
Language: Swedish  (V3.1 — löser loanword-problemet)

V3.1-förändringar (2026-09-02):
- audio_instr_forward: enkel mening "Förklara ordet X" (lowercase substantiv)
- audio_forklaring: prepended "{begrepp} är" + expand_abbrev() på förklaringen
- audio_instr_reverse: "Vilket ord kan förklaras såhär" + expand_abbrev()
- audio_begrepp: standalone (lowercase substantiv)
- ALLA prompts använder --language Swedish (löser auto-detect-felet för lånord)

BUG att undvika (2026-09-02 #14792): regex med trailing \b efter period funkar inte
(period är icke-ord-tecken). Använd r'\bt\.ex\.' UTAN trailing \b.

Auth (memory/audio-permanent-fix.md):
    mmx auth login --api-key "$(cat /tmp/.mmx-key)"   (UTAN --region!)
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


VOICE = "Swedish_male_1_v1"
MODEL = "speech-2.8-hd"
SPEED = "0.85"
LANGUAGE = "Swedish"


def check_mmx_auth() -> bool:
    """Verifiera att mmx är authad."""
    try:
        r = subprocess.run(
            ["mmx", "auth", "status"],
            capture_output=True, text=True, timeout=10
        )
        if r.returncode != 0:
            return False
        return '"method":' in r.stdout or "method:" in r.stdout
    except Exception as e:
        print(f"  ✗ auth check misslyckades: {e}", file=sys.stderr)
        return False


def expand_abbreviations(text: str) -> str:
    """
    Expandera vanliga svenska förkortningar för TTS-prompt.

    VIKTIGT: Använd INTE trailing \b efter period — period är icke-ord-tecken.
    Exempel: r'\bt\.ex\.' (utan \b efter sista .)
    """
    abbreviations = {
        r'\bt\.ex\.': 'till exempel',
        r'\bT\.ex\.': 'Till exempel',
        r'\bosv\.': 'och så vidare',
        r'\bOsv\.': 'Och så vidare',
        r'\bbl\.a\.': 'bland annat',
        r'\bBl\.a\.': 'Bland annat',
        r'\bca\.': 'cirka',
        r'\bCa\.': 'Cirka',
        r'\bdvs\.': 'det vill säga',
        r'\bDvs\.': 'Det vill säga',
        r'\bm\.fl\.': 'med flera',
        r'\bM\.fl\.': 'Med flera',
        r'\bmm\.': 'med mera',
        r'\bMm\.': 'Med mera',
        r'\betc\.': 'et cetera',
        r'\bEtc\.': 'Et cetera',
    }
    for pattern, replacement in abbreviations.items():
        text = re.sub(pattern, replacement, text)
    return text


def synth(text: str, out_path: Path) -> bool:
    """Kör mmx speech synthesize. Returnerar True om fil skapades."""
    try:
        r = subprocess.run(
            ["mmx", "speech", "synthesize",
             "--text", text,
             "--voice", VOICE,
             "--model", MODEL,
             "--speed", SPEED,
             "--language", LANGUAGE,
             "--out", str(out_path),
             "--quiet"],
            capture_output=True, text=True, timeout=60
        )
        return out_path.exists()
    except Exception as e:
        print(f"  ✗ synth error: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default="audio", help="Output-katalog")
    parser.add_argument("--data-json", default="begrepp-data.json", help="JSON med begrepp")
    parser.add_argument("--dry-run", action="store_true", help="Visa utan att köra")
    parser.add_argument(
        "--type",
        choices=["instr-forward", "forklaring", "instr-reverse", "begrepp", "all"],
        default="all",
        help="Vilken typ: specifik typ eller 'all' (default)"
    )
    args = parser.parse_args()

    data_path = Path(args.data_json)
    if not data_path.exists():
        print(f"✗ Hittar inte {data_path}", file=sys.stderr)
        sys.exit(1)

    with open(data_path) as f:
        data = json.load(f)
    begrepp_list = data.get("begrepp", [])
    if not begrepp_list:
        print(f"✗ Inga begrepp i {data_path}", file=sys.stderr)
        sys.exit(1)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    types_to_generate = ["instr-forward", "forklaring", "instr-reverse", "begrepp"] if args.type == "all" else [args.type]
    n_total = len(begrepp_list) * len(types_to_generate)

    print(f"Genererar {n_total} filer (types: {', '.join(types_to_generate)})")
    print(f"Voice:    {VOICE}")
    print(f"Language: {LANGUAGE} (V3.1)")
    print(f"Output:   {out_dir.resolve()}")
    print()

    if not args.dry_run:
        if not check_mmx_auth():
            print("✗ mmx auth inte konfigurerad!", file=sys.stderr)
            print('  Kör: mmx auth login --api-key "$(cat /tmp/.mmx-key)"', file=sys.stderr)
            sys.exit(1)
        print("✓ mmx auth OK")
        print()

    ok = fail = 0

    for b in begrepp_list:
        wid = b["id"]
        ord_text = b["begrepp"]
        forkl_text = b["forklaring"]
        exp_forkl = expand_abbreviations(forkl_text.lower())

        # V3.1 PROMPTS (Johanna-direktiv 2026-09-02)
        prompts = {
            "instr-forward": f"Förklara ordet {ord_text.lower()}",
            "forklaring": f"{ord_text} är {exp_forkl}",
            "instr-reverse": f"Vilket ord kan förklaras såhär: {exp_forkl}",
            "begrepp": ord_text.lower(),
        }

        for typ in types_to_generate:
            text = prompts[typ]
            out = out_dir / f"{wid}-{typ}.mp3"

            if args.dry_run:
                print(f"  [dry-run] {out.name}: '{text[:70]}...'")
                ok += 1
            elif synth(text, out):
                print(f"  ✓ {out.name}")
                ok += 1
            else:
                print(f"  ✗ {out.name}")
                fail += 1

    print()
    print(f"Resultat: {ok}/{n_total} ok, {fail}/{n_total} fail")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
