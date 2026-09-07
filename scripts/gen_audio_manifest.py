#!/usr/bin/env python3
"""
gen_audio_manifest.py — Genererar audio-manifest JSON från begrepp-data.json

Usage:
    python3 gen_audio_manifest.py [--out manifest.json]

Manifestet definierar:
- Delade filer (generiska)
- Per-begrepp: begrepp/forklaring-filer
- Förväntade sekvenser (forward_initial, forward_reveal, reverse_initial, reverse_reveal)

Exit: 0 alltid (dry-run om --dry-run)
"""
import argparse
import json
from pathlib import Path


def generate_manifest(data_json: Path, out_path: Path, dry_run: bool = False) -> dict:
    with open(data_json) as f:
        data = json.load(f)

    begrepp_list = data.get("begrepp", [])

    manifest = {
        "version": "1.0",
        "generated_from": str(data_json),
        "shared": [
            "instr-forward.mp3",
            "instr-reverse.mp3",
            "audio-ar.mp3",
        ],
        "concepts": [],
    }

    for b in begrepp_list:
        wid = b["id"]
        begrepp_file = f"{wid}-begrepp.mp3"
        forklaring_file = f"{wid}-forklaring.mp3"

        concept = {
            "id": wid,
            "begrepp": begrepp_file,
            "forklaring": forklaring_file,
            "forward_initial": ["instr-forward.mp3", begrepp_file],
            "forward_reveal": [begrepp_file, "audio-ar.mp3", forklaring_file],
            "reverse_initial": ["instr-reverse.mp3", forklaring_file],
            "reverse_reveal": [begrepp_file],
        }
        manifest["concepts"].append(concept)

    output = json.dumps(manifest, indent=2, ensure_ascii=False)

    if dry_run:
        print("=== DRY RUN — manifest content ===")
        print(output)
        print("=== END DRY RUN ===")
    else:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(output + "\n")
        print(f"Manifest written to {out_path}")

    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-json", default="begrepp-data.json",
                        help="Input JSON file")
    parser.add_argument("--out", default="audio-manifest.json",
                        help="Output manifest file")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print without writing")
    args = parser.parse_args()

    data_path = Path(args.data_json)
    if not data_path.exists():
        print(f"ERROR: {data_path} not found", file=__import__('sys').stderr)
        __import__('sys').exit(1)

    out_path = Path(args.out)
    generate_manifest(data_path, out_path, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
