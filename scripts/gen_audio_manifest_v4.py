#!/usr/bin/env python3
"""
gen_audio_manifest_v4.py — Genererar audio-manifest JSON från begrepp-data.json (V4)

V4-struktur: 4 audio-filer per begrepp (1 fraga + 1 svar + 1 reverse-fraga + 1 reverse-svar).
Inga delade filer. Sekvenser är triviala (1 fil vardera).

Usage:
    python3 gen_audio_manifest_v4.py [--out manifest.json]
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
        "shared": [],
        "concepts": [],
    }

    for b in begrepp_list:
        wid = b["id"]
        concept = {
            "id": wid,
            "fraga": b["audio_fraga"],
            "svar": b["audio_svar"],
            "reverse_fraga": b["audio_reverse_fraga"],
            "reverse_svar": b["audio_reverse_svar"],
            "forward_initial": [b["audio_fraga"]],
            "forward_reveal": [b["audio_svar"]],
            "reverse_initial": [b["audio_reverse_fraga"]],
            "reverse_reveal": [b["audio_reverse_svar"]],
        }
        manifest["concepts"].append(concept)

    output = json.dumps(manifest, indent=2, ensure_ascii=False)

    if dry_run:
        print("=== DRY RUN ===")
        print(output)
        print("=== END ===")
    else:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(output + "\n")
        print(f"Manifest written to {out_path}")

    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-json", default="begrepp-data.json")
    parser.add_argument("--out", default="audio-manifest.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    data_path = Path(args.data_json)
    if not data_path.exists():
        import sys
        print(f"ERROR: {data_path} not found", file=sys.stderr)
        sys.exit(1)

    generate_manifest(data_path, Path(args.out), dry_run=args.dry_run)


if __name__ == "__main__":
    main()
