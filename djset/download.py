"""Download audio for each Spotify track via yt-dlp (resumable + cached).

We only need the audio locally to *analyse* it; playback still happens through
the Spotify API. Each file is named {track_id}.m4a so the analyser and the
Spotify URI stay linked.
"""
from __future__ import annotations

import json
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd

from . import config


def _existing(track_id: str):
    matches = list(config.AUDIO_DIR.glob(f"{track_id}.*"))
    return matches[0] if matches else None


def _probe_duration(path) -> float | None:
    """Return audio duration in seconds via ffprobe, or None."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, timeout=30,
        )
        return float(out.stdout.strip())
    except Exception:
        return None


def _download_one(row: dict) -> dict:
    tid = config.track_id(row["Track URI"])
    name = str(row["Track Name"])
    artist = str(row["Artist Name(s)"]).split(";")[0].strip()
    want_sec = float(row.get("Duration (ms)") or 0) / 1000.0

    existing = _existing(tid)
    if existing:
        return {"id": tid, "name": name, "status": "cached", "path": str(existing)}

    out_tmpl = str(config.AUDIO_DIR / f"{tid}.%(ext)s")
    query = f"ytsearch1:{artist} {name} audio"
    cmd = [
        "yt-dlp", "--no-playlist", "--quiet", "--no-warnings",
        "-f", "bestaudio",
        "-x", "--audio-format", config.AUDIO_EXT, "--audio-quality", config.AUDIO_QUALITY,
        # match-filter rejects results whose duration is way off (sped-up/live/wrong)
        "-o", out_tmpl, query,
    ]
    if want_sec > 0:
        lo, hi = want_sec * (1 - config.DURATION_TOLERANCE), want_sec * (1 + config.DURATION_TOLERANCE)
        cmd[3:3] = ["--match-filter", f"duration > {lo:.0f} & duration < {hi:.0f}"]

    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=240, check=True)
    except subprocess.CalledProcessError as e:
        return {"id": tid, "name": name, "status": "failed",
                "error": (e.stderr or "")[-200:]}
    except subprocess.TimeoutExpired:
        return {"id": tid, "name": name, "status": "timeout"}

    got = _existing(tid)
    if not got:
        # duration filter rejected every candidate
        return {"id": tid, "name": name, "status": "no_match"}

    # final duration sanity check (filter is best-effort)
    if want_sec > 0:
        dur = _probe_duration(got)
        if dur and abs(dur - want_sec) / want_sec > config.DURATION_TOLERANCE:
            got.unlink(missing_ok=True)
            return {"id": tid, "name": name, "status": "bad_duration",
                    "got_sec": round(dur, 1), "want_sec": round(want_sec, 1)}
    return {"id": tid, "name": name, "status": "downloaded", "path": str(got)}


def run(limit: int | None = None, workers: int = 4,
        track_ids: list[str] | None = None, on_progress=None) -> list[dict]:
    """Download library audio. If track_ids is given, only those tracks
    (e.g. a selected playlist). on_progress(done, total, msg) streams status."""
    config.ensure_dirs()
    df = pd.read_csv(config.find_csv())
    rows = df.to_dict("records")
    if track_ids is not None:
        wanted = set(track_ids)
        rows = [r for r in rows if config.track_id(r["Track URI"]) in wanted]
    if limit:
        rows = rows[:limit]

    results: list[dict] = []
    done = 0
    total = len(rows)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_download_one, r): r for r in rows}
        for fut in as_completed(futures):
            res = fut.result()
            results.append(res)
            done += 1
            flag = {"downloaded": "+", "cached": ".", }.get(res["status"], "x")
            print(f"[{done}/{total}] {flag} {res['status']:>12}  {res['name'][:48]}")
            if on_progress:
                on_progress(done, total, f"{res['status']}: {res['name'][:40]}")

    config.DOWNLOAD_LOG.write_text(json.dumps(results, indent=2))
    ok = sum(1 for r in results if r["status"] in ("downloaded", "cached"))
    bad = [r for r in results if r["status"] not in ("downloaded", "cached")]
    print(f"\nDownloaded/cached {ok}/{len(rows)}.  {len(bad)} need attention "
          f"(see {config.DOWNLOAD_LOG.name}).")
    return results
