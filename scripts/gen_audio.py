#!/usr/bin/env python3
"""
gen_audio.py — Genererar SV audio-filer för begrepp-appen

Användning:
    python3 gen_audio.py [--out-dir DIR] [--data-json FILE]

Läser begrepp-data.json, genererar 2 MP3-filer per begrepp (begrepp + förklaring) via MiniMax T2A.

Voice ID: Swedish_male_1_v1  (verifierad i rattstavning/AUDIO-PIPELINE.md, använd i glosor-appen)
Model:    speech-2.8-hd
Speed:    0.85

Prompter (MiniMax T2A, svensk röst):
- Begrepp:   'Skriv ordet #"<begrepp>"'       (# = paus-separator för SV-rösten)
- Förklaring:'Läs meningen #"<förklaring>"'

Auth (memory/audio-permanent-fix.md):
    mmx auth login --api-key "$(cat /tmp/.mmx-key)"   (UTAN --region!)

Exempel:
    python3 gen_audio.py
    python3 gen_audio.py --dry-run
    python3 gen_audio.py --type begrepp      # bara begrepp-filer
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path


VOICE = "Swedish_male_1_v1"
MODEL = "speech-2.8-hd"
SPEED = "0.85"


def check_mmx_auth() -> bool:
    """Verifiera att mmx är authad. Returnerar True om auth.status visar method."""
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


def synth(text: str, voice: str, out_path: Path) -> bool:
    """Kör mmx speech synthesize. Returnerar True om fil skapades."""
    try:
        r = subprocess.run(
            ["mmx", "speech", "synthesize",
             "--text", text,
             "--voice", voice,
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
    parser.add_argument("--out-dir", default="audio", help="Output-katalog (default: audio/)")
    parser.add_argument("--data-json", default="begrepp-data.json", help="JSON med begrepp")
    parser.add_argument("--dry-run", action="store_true", help="Visa utan att köra")
    parser.add_argument("--type", choices=["begrepp", "forklaring", "both"], default="both",
                        help="Vilken typ: begrepp, forklaring eller both (default: both)")
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

    n_total = len(begrepp_list) * (2 if args.type == "both" else 1)
    print(f"Genererar {n_total} filer (type={args.type})")
    print(f"Output: {out_dir.resolve()}")
    print(f"Voice:  {VOICE}, model={MODEL}, speed={SPEED}")
    print()

    if not args.dry_run:
        if not check_mmx_auth():
            print("✗ mmx auth inte konfigurerad!", file=sys.stderr)
            print('  Kör: mmx auth login --api-key "$(cat /tmp/.mmx-key)"', file=sys.stderr)
            sys.exit(1)
        print("✓ mmx auth OK")
        print()

    ok = fail = 0

    # Begrepp: 'Skriv ordet #"<begrepp>"' — # paus-separator för SV-rösten
    if args.type in ("begrepp", "both"):
        for b in begrepp_list:
            wid = b["id"]
            ord_text = b["begrepp"]
            out_path = out_dir / f"{wid}-begrepp.mp3"
            text = f'Skriv ordet #"{ord_text}"'
            if args.dry_run:
                print(f"  [dry-run] {out_path.name}: '{text}'")
                ok += 1
            elif synth(text, VOICE, out_path):
                print(f"  ✓ {out_path.name}")
                ok += 1
            else:
                print(f"  ✗ {out_path.name}")
                fail += 1

    # Förklaring: 'Läs meningen #"<förklaring>"' — samma paus-pattern, "meningen" cue
    if args.type in ("forklaring", "both"):
        for b in begrepp_list:
            wid = b["id"]
            forkl_text = b["forklaring"]
            out_path = out_dir / f"{wid}-forklaring.mp3"
            text = f'Läs meningen #"{forkl_text}"'
            if args.dry_run:
                print(f"  [dry-run] {out_path.name}: '{text}'")
                ok += 1
            elif synth(text, VOICE, out_path):
                print(f"  ✓ {out_path.name}")
                ok += 1
            else:
                print(f"  ✗ {out_path.name}")
                fail += 1

    print()
    print(f"Resultat: {ok}/{n_total} ok, {fail}/{n_total} fail")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
