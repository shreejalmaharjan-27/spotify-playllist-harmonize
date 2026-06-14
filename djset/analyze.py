"""librosa feature extraction for each downloaded track (cached + parallel).

Produces the *real* analysis that sortbytune-style tools lack: true detected
tempo, key/Camelot from chroma, an energy curve and a downsampled waveform for
the dashboard. Per-track results are cached to data/features/{id}.json so this
heavy step only runs once.
"""
from __future__ import annotations

import json
import warnings
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np
import pandas as pd

from . import config
from .camelot import camelot_code, estimate_key, key_name

warnings.filterwarnings("ignore")


def _downsample(arr: np.ndarray, n: int) -> list[float]:
    arr = np.asarray(arr, dtype=float)
    if arr.size == 0:
        return [0.0] * n
    idx = np.linspace(0, arr.size - 1, n).astype(int)
    return [round(float(x), 4) for x in arr[idx]]


class _FileTimeout(Exception):
    pass


def _raise_timeout(signum, frame):
    raise _FileTimeout()


def analyze_file(path_str: str, track_id: str) -> dict | None:
    import signal

    import librosa  # imported inside worker process

    cache = config.FEATURES_DIR / f"{track_id}.json"
    if cache.exists():
        return json.loads(cache.read_text())

    # Hard per-file timeout: a malformed audio file can make ffmpeg/audioread
    # block forever with no error, freezing the whole pool. Each task runs in a
    # worker process's main thread, so SIGALRM works here. (No-op on Windows.)
    have_alarm = hasattr(signal, "SIGALRM")
    if have_alarm:
        signal.signal(signal.SIGALRM, _raise_timeout)
        signal.alarm(config.ANALYZE_TIMEOUT_SEC)

    try:
        # duration cap also keeps pathologically long files (DJ mixes, podcasts)
        # from blowing up memory/time — a few minutes is plenty for features.
        y, sr = librosa.load(path_str, sr=config.SAMPLE_RATE, mono=True,
                             duration=config.ANALYZE_MAX_SECONDS)
        if y.size < sr:  # < 1s of audio is junk
            return None

        # Tempo via autocorrelation of the onset envelope. We deliberately avoid
        # librosa.beat.beat_track's numba DP step, which segfaults on Apple
        # Silicon under some numba/LLVM builds; feature.tempo is robust.
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        bpm = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=onset_env, sr=sr))[0])

        # Key: CQT chroma is most accurate; fall back to STFT chroma if needed.
        try:
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        except Exception:
            chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        pc, mode, key_conf = estimate_key(chroma.mean(axis=1))

        rms = librosa.feature.rms(y=y)[0]
        energy = float(np.sqrt(np.mean(rms ** 2)))
        centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))

        # pulse clarity -> groove/danceability proxy (0..1)
        pulse = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
        groove = float(np.clip(np.std(pulse) / (np.mean(pulse) + 1e-9), 0, 1))

        loudness_db = float(20 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-9))
        beat_count = int(round(bpm / 60.0 * len(y) / sr))

        feat = {
            "id": track_id,
            "bpm": round(bpm, 2),
            "key_pc": int(pc),
            "mode": int(mode),
            "camelot": camelot_code(pc, mode),
            "key_name": key_name(pc, mode),
            "key_conf": round(key_conf, 3),
            "energy": round(energy, 4),
            "centroid": round(centroid, 1),
            "groove": round(groove, 4),
            "loudness_db": round(loudness_db, 2),
            "duration_sec": round(len(y) / sr, 1),
            "beat_count": beat_count,
            "energy_curve": _downsample(rms, config.ENERGY_CURVE_POINTS),
            "waveform": _downsample(np.abs(y), config.WAVEFORM_POINTS),
        }
        cache.write_text(json.dumps(feat))
        return feat
    except _FileTimeout:
        print(f"  ! timeout ({config.ANALYZE_TIMEOUT_SEC}s) analyzing {track_id}, skipping")
        return None
    except Exception as e:
        print(f"  ! analyze failed for {track_id}: {e}")
        return None
    finally:
        if have_alarm:
            signal.alarm(0)


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    """Scale energy & groove to 0..1 across the library for stable weighting."""
    for col in ("energy", "groove"):
        lo, hi = df[col].quantile(0.05), df[col].quantile(0.95)
        rng = (hi - lo) or 1.0
        df[col + "_n"] = ((df[col] - lo) / rng).clip(0, 1)
    return df


def _rebuild_parquet(meta: pd.DataFrame) -> pd.DataFrame:
    """Aggregate ALL cached per-track feature jsons into features.parquet.

    Reading every cache file (not just this run's) keeps the parquet correct
    when analysis is run incrementally (e.g. per playlist)."""
    feats = []
    for jf in sorted(config.FEATURES_DIR.glob("*.json")):
        try:
            feats.append(json.loads(jf.read_text()))
        except Exception:
            continue
    if not feats:
        return pd.DataFrame()
    df = pd.DataFrame(feats).set_index("id")
    cols = {"Track URI": "uri", "Track Name": "name", "Artist Name(s)": "artists"}
    df = df.join(meta[list(cols)].rename(columns=cols))
    df["artists"] = df["artists"].astype(str).str.replace(";", ", ")
    df = _normalize(df)
    scalar_cols = [c for c in df.columns if c not in ("energy_curve", "waveform")]
    df[scalar_cols].to_parquet(config.FEATURES_PARQUET)
    return df


def run(limit: int | None = None, workers: int | None = None,
        track_ids: list[str] | None = None, on_progress=None) -> pd.DataFrame:
    """Analyze downloaded audio. If track_ids is given, only those tracks.
    on_progress(done, total, msg) streams status. The parquet is rebuilt from
    all cached features afterwards so incremental runs accumulate."""
    config.ensure_dirs()
    meta = pd.read_csv(config.find_csv())
    meta["id"] = meta["Track URI"].map(config.track_id)
    meta = meta.set_index("id")
    wanted = set(track_ids) if track_ids is not None else None

    jobs = []
    for path in sorted(config.AUDIO_DIR.glob("*.*")):
        tid = path.stem
        if tid in meta.index and (wanted is None or tid in wanted):
            jobs.append((str(path), tid))
    if limit:
        jobs = jobs[:limit]

    total = len(jobs)
    if not on_progress:
        print(f"Analyzing {total} tracks...")
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(analyze_file, p, t): t for p, t in jobs}
        for i, fut in enumerate(as_completed(futures), 1):
            fut.result()
            # When a progress callback is driving the display, stay quiet so we
            # don't clobber its single-line bar.
            if not on_progress and (i % 25 == 0 or i == total):
                print(f"  [{i}/{total}] analyzed")
            if on_progress:
                on_progress(i, total, "analyzing audio")

    df = _rebuild_parquet(meta)
    if not on_progress:
        print(f"Saved {len(df)} rows -> {config.FEATURES_PARQUET.name}")
    return df
