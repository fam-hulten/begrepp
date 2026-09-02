#!/usr/bin/env python3
"""
gen_audio.py — Genererar 4 SV audio-filer per begrepp (instr + svar, båda riktningar)

Per begrepp genereras 4 MP3-filer:
  1. {id}-instr-forward.mp3   → 'Förklara ordet "{begrepp}"'   (pedagogisk instruktion)
  2. {id}-forklaring.mp3      → '{förklaring}' (ren text)
  3. {id}-instr-reverse.mp3   → 'Vilket ord kan förklaras såhär: {förklaring}'
  4. {id}-begrepp.mp3          → '{begrepp}' (ren text)

Voice: Swedish_male_1_v1  (MiniMax T2A — verifierad via glosor-appen 2026-09-01)
Model: speech-2.8-hd
Speed: 0.85

Paus-pattern: ` # ` funkar som paus-separator för SV-rösten (verifierad i glosor).

V2-förändring (2026-09-02): separata filer för instruktion + svar (Johanna-direktiv)
så appen kan spela instruktion → paus → svar för aktiv retrieval-träning.
Tidigare version använde en enda fil med 'Skriv ordet'/'Läs meningen'-prefix (fel approach).

Auth (memory/audio-permanent-fix.md):
    mmx auth login --api-key "$(cat /tmp/.mmx-key)"   (UTAN --region!)
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path


VOICE = "Swedish_male_1_v1"
MODEL = "speech-2.8-hd"
SPEED = "0.85"
# Paus-separator (verifierad i MiniMax T2A SV-röst)
PAUS = " # "


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


def synth(text: str, out_path: Path) -> bool:
    """Kör mmx speech synthesize. Returnerar True om fil skapades."""
    try:
        r = subprocess.run(
            ["mmx", "speech", "synthesize",
             "--text", text,
             "--voice", VOICE,
             "--model", MODEL,
             "--speed", SPEED,
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

    n_total = len(begrepp_list) * 4
    print(f"Genererar {n_total} filer (4 per begrepp)")
    print(f"Voice:  {VOICE} (verified MiniMax T2A)")
    print(f"Output: {out_dir.resolve()}")
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

        # 1. Instruktion forward: 'Förklara ordet "{begrepp}"'
        out_1 = out_dir / f"{wid}-instr-forward.mp3"
        text_1 = f'Förklara ordet{PAUS}"{ord_text}"'
        if args.dry_run:
            print(f"  [dry-run] {out_1.name}: '{text_1}'")
            ok += 1
        elif synth(text_1, out_1):
            print(f"  ✓ {out_1.name}")
            ok += 1
        else:
            print(f"  ✗ {out_1.name}")
            fail += 1

        # 2. Förklaring (ren text)
        out_2 = out_dir / f"{wid}-forklaring.mp3"
        text_2 = forkl_text
        if args.dry_run:
            print(f"  [dry-run] {out_2.name}: '{text_2}'")
            ok += 1
        elif synth(text_2, out_2):
            print(f"  ✓ {out_2.name}")
            ok += 1
        else:
            print(f"  ✗ {out_2.name}")
            fail += 1

        # 3. Instruktion reverse: 'Vilket ord kan förklaras såhär: {förklaring}'
        out_3 = out_dir / f"{wid}-instr-reverse.mp3"
        text_3 = f'Vilket ord kan förklaras såhär{PAUS}{forkl_text}'
        if args.dry_run:
            print(f"  [dry-run] {out_3.name}: '{text_3}'")
            ok += 1
        elif synth(text_3, out_3):
            print(f"  ✓ {out_3.name}")
            ok += 1
        else:
            print(f"  ✗ {out_3.name}")
            fail += 1

        # 4. Begrepp (ren text)
        out_4 = out_dir / f"{wid}-begrepp.mp3"
        text_4 = ord_text
        if args.dry_run:
            print(f"  [dry-run] {out_4.name}: '{text_4}'")
            ok += 1
        elif synth(text_4, out_4):
            print(f"  ✓ {out_4.name}")
            ok += 1
        else:
            print(f"  ✗ {out_4.name}")
            fail += 1

    print()
    print(f"Resultat: {ok}/{n_total} ok, {fail}/{n_total} fail")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
