#!/usr/bin/env python3
"""
gen_audio_v4.py — Genererar 4 audio-filer per begrepp (V4 hela-meningar-struktur)

Per begrepp genereras 4 MP3-filer (Johanna-direktiv 2026-09-10):
  1. {id}-fraga.mp3          → "Förklara ordet {ord.lower()}"              (speed 0.85, kort)
  2. {id}-svar.mp3           → smart-detect: {forklaring} om den innehåller
                                  begrepp-namnet, annars "{ord} är {forklaring}"
                                  eller b["audio_svar_text"] om overridad
  3. {id}-reverse-fraga.mp3  → "Vilket ord betyder: {reverse_forklaring.lower()}"
                                  (eller {forklaring.lower()} om reverse_forklaring saknas)
  4. {id}-reverse-svar.mp3   → {begrepp}                                    (speed 1.0)

V5.2 (Johanna 2026-10-02 08:17): svar-prompten smart-detect (vill inte prepending
 när forklaringen redan börjar med "X är...").

V5.3 (Johanna 2026-10-02 08:49): smart-detect med optional audio_svar_text-override.

V5.4 (Johanna 2026-10-02 08:56): reverse-fraga-prompten använder reverse_forklaring
 (utan begreppsnamnet) för att inte ge bortalt svaret i reverse-läget där eleven
 ska minnetaså från beskrivningen. Override-fält: reverse_forklaring per begrepp
 (auto-genereras om saknas — se WORKFLOW.md).

V5.4.1: Multi-subject-medveten (subjects[]-schema) + --subject filter + --dry-run.

Voice: Swedish_male_1_v1 (MiniMax T2A)
Model: speech-2.8-hd
Language: Swedish
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

VOICE = "Swedish_male_1_v1"
MODEL = "speech-2.8-hd"
LANGUAGE = "Swedish"


def _svar_text(o, f, at, rft):
    """Smart-detect för svar: om forklaringen redan innehåller begrepp-namnet
    → använd som den är. Annars preprependa "{o} är ". audio_svar_text vinner."""
    if at:
        return at
    if re.search(rf"\b{re.escape(o)}\b", f, re.IGNORECASE):
        return f
    return f"{o} är {f}"


def _reverse_fraga_text(o, f, at, rft):
    """Reverse-fraga: använd reverse_forklaring om satt (utan begreppsnamnet),
    annars forklaring. Detta förhindrar att eleven hör svaret i audio-läget."""
    text = rft if rft else f
    return f"Vilket ord betyder: {text.lower()}"


PROMPT_MAP = {
    "fraga":         (lambda o, f, at, rft: f"Förklara ordet {o.lower()}",         "0.85"),
    "svar":          (_svar_text,                                                   "1.0"),
    "reverse-fraga": (_reverse_fraga_text,                                          "1.0"),
    "reverse-svar":  (lambda o, f, at, rft: o,                                     "1.0"),
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


def collect_begrepp(data: dict, subject_filter):
    """Samla alla aktiva begrepp från subjects[]-strukturen."""
    out = []
    if "subjects" in data:
        for subj in data["subjects"]:
            if subject_filter and subj["id"] != subject_filter:
                continue
            if subj.get("archived") is True:
                continue
            for b in subj.get("begrepp", []):
                if b.get("active") is False:
                    continue
                b2 = dict(b)
                b2["_subject_id"] = subj["id"]
                out.append(b2)
    else:
        out.extend(data.get("begrepp", []))
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default="audio")
    parser.add_argument("--data-json", default="begrepp-data.json")
    parser.add_argument("--type", choices=["fraga", "svar", "reverse-fraga", "reverse-svar", "all"], default="all")
    parser.add_argument("--subject", default=None,
                        help="Generera bara för specifikt ämne (t.ex. 'no'). Default: alla aktiva.")
    parser.add_argument("--dry-run", action="store_true", help="Visa prompts utan att köra mmx.")
    args = parser.parse_args()

    data_path = Path(args.data_json)
    if not data_path.exists():
        print(f"✗ Hittar inte {data_path}", file=sys.stderr)
        sys.exit(1)

    with open(data_path) as f:
        data = json.load(f)

    begrepp_list = collect_begrepp(data, args.subject)
    if not begrepp_list:
        print(f"✗ Inga aktiva begrepp hittades (subject={args.subject})", file=sys.stderr)
        sys.exit(1)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    types = list(PROMPT_MAP.keys()) if args.type == "all" else [args.type]
    n_total = len(begrepp_list) * len(types)

    print(f"Genererar {n_total} filer ({len(types)} typer × {len(begrepp_list)} begrepp)")
    print(f"Voice:    {VOICE}")
    print(f"Model:    {MODEL}")
    print(f"Language: {LANGUAGE}")
    print(f"Subject:  {args.subject or '(alla aktiva)'}")
    print(f"Output:   {out_dir.resolve()}")
    print()

    if not args.dry_run and not check_mmx_auth():
        print("✗ mmx auth inte konfigurerad!", file=sys.stderr)
        print('  Kör: mmx auth login --api-key "$(cat /tmp/.mmx-key)"', file=sys.stderr)
        sys.exit(1)
    if not args.dry_run:
        print("✓ mmx auth OK\n")

    ok = fail = 0

    for b in begrepp_list:
        wid = b["id"]
        ord_text = b["begrepp"]
        forkl_text = b["forklaring"]
        reverse_forklaring = b.get("reverse_forklaring") or forkl_text
        audio_svar_text = b.get("audio_svar_text")
        subj_label = b.get("_subject_id", "?")

        for typ in types:
            text_fn, speed = PROMPT_MAP[typ]
            text = text_fn(ord_text, forkl_text, audio_svar_text, reverse_forklaring)
            out = out_dir / f"{wid}-{typ}.mp3"

            if args.dry_run:
                print(f"  [dry-run] {out.name}  [{subj_label}]  text={text!r}")
                ok += 1
            elif synth(text, speed, out):
                print(f"  ✓ {out.name}  [{subj_label}]  (speed {speed})")
                ok += 1
            else:
                print(f"  ✗ {out.name}")
                fail += 1

    print()
    print(f"Resultat: {ok}/{n_total} ok, {fail}/{n_total} fail")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
