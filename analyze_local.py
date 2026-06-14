#!/usr/bin/env python
"""Run audio analysis NATIVELY (no Docker) across all CPU cores, with a live
progress bar.

Docker Desktop on macOS runs Linux in a CPU-throttled VM, so analysis there is
slow. This runs the exact same pipeline directly on the host using all cores and
writes to ./data/features — the same folder the app reads via its bind mount, so
results show up in the dashboard automatically.

Run it with the djset conda env:

    conda run -n djset python analyze_local.py
    # or:  conda activate djset && python analyze_local.py
"""
from __future__ import annotations

import os
import sys
import time

from djset import analyze, config


def make_bar(start: float):
    width = 36

    def bar(done: int, total: int, _msg: str = "") -> None:
        frac = done / total if total else 1.0
        filled = int(width * frac)
        elapsed = time.time() - start
        rate = done / elapsed if elapsed > 0 else 0.0
        eta = (total - done) / rate if rate > 0 else 0.0
        b = "█" * filled + "·" * (width - filled)
        sys.stdout.write(
            f"\r  [{b}] {done}/{total}  {frac * 100:4.0f}%  "
            f"{rate:4.1f} tracks/s  ETA {int(eta // 60)}:{int(eta % 60):02d}   "
        )
        sys.stdout.flush()

    return bar


def main() -> None:
    config.ensure_dirs()
    n_audio = len(list(config.AUDIO_DIR.glob("*.*")))
    n_done = len(list(config.FEATURES_DIR.glob("*.json")))
    cores = os.cpu_count() or 1

    print(
        f"Analyzing {n_audio} downloaded tracks on {cores} cores "
        f"({n_done} already cached, will be skipped)",
        flush=True,
    )
    if n_audio == 0:
        print("No audio in data/audio — run the download step first.")
        return

    print(
        f"  warming up {cores} workers (first bar update in a few seconds)…",
        flush=True,
    )
    start = time.time()
    df = analyze.run(on_progress=make_bar(start))
    elapsed = int(time.time() - start)

    print("\n")
    print(f"✓ Done in {elapsed // 60}m {elapsed % 60}s")
    print(f"  {len(df)} tracks analyzed → data/features.parquet")
    print("  The dashboard will now show DJ info for these tracks.")


if __name__ == "__main__":
    main()
