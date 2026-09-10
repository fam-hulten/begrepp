#!/usr/bin/env python3
"""
gen_audio_v4.py — Genererar 4 audio-filer per begrepp (V4 hela-meningar-struktur)

Per begrepp genereras 4 MP3-filer (Johanna-direktiv 2026-09-10):
  1. {id}-fraga.mp3          → "Förklara ordet {ord.lower()}"        (speed 0.85, kort)
  2. {id}-svar.mp3           → "{ord} är {definition}"               (speed 1.0, hela meningen)
  3. {id}-reverse-fraga.mp3  → "Vilket ord betyder: {definition}"    (speed 1.0)
  4. {id}-reverse-svar.mp3   → "{ord}"                                (speed 1.0)

Voice: Swedish_male_1_v1 (MiniMax T2A)
Model: speech-2.8-hd
Language: Swedish
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

VOICE = "Swedish_male_1_v1"
MODEL = "speech-2.8-hd"
LANGUAGE = "Swedish"

# (text, speed) per typ
PROMPT_MAP = {
    "fraga":         (lambda o, f: f"Förklara ordet {o.lower()}",                       "0.85"),
    "svar":          (lambda o, f: f"{o} är {f}",                                       "1.0"),
    "reverse-fraga": (lambda o, f: f"Vilket ord betyder: {f.lower()}",                  "1.0"),
    "reverse-svar":  (lambda o, f: o,                                                   "1.0"),
}


def check_mmx_auth() -> bool:
    try:
        r = subprocess.run(["mmx", "auth", "status"], capture_output=True, text=True, timeout=10)
        return r.returncode == 0 and '"method":' in r.stdout
    except Exception as e:
        print(f"  ✗ auth check misslyckades: {e}", file=sys.stderr)
        return False


def synth(text: str, speed: str, out_path: Path) -> bool:
    try:
        r = subprocess.run(
            ["mmx", "speech", "synthesize",
             "--text", text,
             "--voice", VOICE,
             "--model", MODEL,
             "--speed", speed,
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
    parser.add_argument("--out-dir", default="audio")
    parser.add_argument("--data-json", default="begrepp-data.json")
    parser.add_argument("--type", choices=["fraga", "svar", "reverse-fraga", "reverse-svar", "all"], default="all")
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

    types = list(PROMPT_MAP.keys()) if args.type == "all" else [args.type]
    n_total = len(begrepp_list) * len(types)

    print(f"Genererar {n_total} filer ({len(types)} typer × {len(begrepp_list)} begrepp)")
    print(f"Voice:    {VOICE}")
    print(f"Model:    {MODEL}")
    print(f"Language: {LANGUAGE}")
    print(f"Output:   {out_dir.resolve()}")
    print()

    if not check_mmx_auth():
        print("✗ mmx auth inte konfigurerad!", file=sys.stderr)
        sys.exit(1)
    print("✓ mmx auth OK\n")

    ok = fail = 0

    for b in begrepp_list:
        wid = b["id"]
        ord_text = b["begrepp"]
        forkl_text = b["forklaring"]

        for typ in types:
            text_fn, speed = PROMPT_MAP[typ]
            text = text_fn(ord_text, forkl_text)
            out = out_dir / f"{wid}-{typ}.mp3"

            if synth(text, speed, out):
                print(f"  ✓ {out.name}  (speed {speed})")
                ok += 1
            else:
                print(f"  ✗ {out.name}")
                fail += 1

    print()
    print(f"Resultat: {ok}/{n_total} ok, {fail}/{n_total} fail")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
