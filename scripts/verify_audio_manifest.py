#!/usr/bin/env python3
"""
verify_audio_manifest.py — Verifierar audio-manifest mot faktiska filer

Usage:
    python3 verify_audio_manifest.py [--manifest audio-manifest.json] [--audio-dir audio] [--verbose]

Exit:
    0 = ALL PASS
    1 = FAIL (något saknas eller har fel energi)
    2 = ERROR (manifest saknas etc.)

Verifierar:
1. ALLA filer i manifestet existerar
2. Inga extra (oväntade) MP3-filer i audio/
3. Per-fil audio-energi via audio-verify.sh
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path


def run_audio_verify(filepath: Path) -> tuple[bool, str, float]:
    """Kör audio-verify.sh mot en fil. Returnerar (pass, reason, duration)."""
    result = subprocess.run(
        ["bash", "/home/node/.openclaw/workspace/scripts/audio-verify.sh", str(filepath)],
        capture_output=True, text=True, timeout=30
    )
    # Parse duration from stderr
    duration = 0.0
    reason = "unknown"
    for line in result.stderr.splitlines():
        if "duration=" in line:
            try:
                duration = float(line.split("duration=")[1].split(",")[0])
            except (ValueError, IndexError):
                pass
        if "PASS" in line or "FAIL" in line:
            reason = line.strip()
    return result.returncode == 0, reason, duration


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="audio-manifest.json",
                        help="Manifest JSON file")
    parser.add_argument("--audio-dir", default="audio",
                        help="Audio directory")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    audio_dir = Path(args.audio_dir)

    if not manifest_path.exists():
        print(f"ERROR: Manifest not found: {manifest_path}", file=sys.stderr)
        print("  Kör först: python3 scripts/gen_audio_manifest.py", file=sys.stderr)
        sys.exit(2)

    with open(manifest_path) as f:
        manifest = json.load(f)

    errors = []
    warnings = []

    # 1. Collect all expected files
    expected = set()
    for shared_file in manifest.get("shared", []):
        expected.add(shared_file)

    for concept in manifest.get("concepts", []):
        expected.add(concept["begrepp"])
        expected.add(concept["forklaring"])

    # 2. Check for missing files
    missing = []
    for fname in sorted(expected):
        fpath = audio_dir / fname
        if not fpath.exists():
            missing.append(fname)

    if missing:
        for fname in missing:
            print(f"  MISSING: {fname}")
        errors.append(f"{len(missing)} file(s) missing")

    # 3. Check for extra files
    if audio_dir.exists():
        actual_mp3 = {f.name for f in audio_dir.glob("*.mp3")}
        extra = actual_mp3 - expected
        if extra:
            for fname in sorted(extra):
                print(f"  EXTRA (warning): {fname}")
            warnings.append(f"{len(extra)} extra file(s) — may be old test files")

    # 4. Verify audio energy for all expected files
    if not errors:  # Skip if files are missing
        print("\nAudio energy verification:")
        all_pass = True
        for fname in sorted(expected):
            fpath = audio_dir / fname
            if not fpath.exists():
                continue
            passed, reason, duration = run_audio_verify(fpath)
            status = "PASS" if passed else "FAIL"
            if args.verbose or not passed:
                print(f"  [{status}] {fname}: {reason} (duration={duration:.2f}s)")
            else:
                print(f"  [{status}] {fname}")
            if not passed:
                errors.append(f"Audio FAIL: {fname}")
                all_pass = False

    # Summary
    print()
    if warnings:
        for w in warnings:
            print(f"WARNING: {w}")

    if errors:
        print(f"RESULT: FAIL — {len(errors)} error(s)")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        print("RESULT: ALL PASS")
        print(f"  {len(expected)} file(s) verified")
        if warnings:
            print(f"  {len(warnings)} warning(s)")
        sys.exit(0)


if __name__ == "__main__":
    main()
