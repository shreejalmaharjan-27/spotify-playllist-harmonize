"""DJ ordering: build a harmonically-mixed set that follows an energy arc.

This is the heart of the project. Instead of sorting on one axis (what
sortbytune does), we walk a path through the library minimizing a weighted
"DJ distance" between neighbours while steering the set's energy along a
build-and-drop target curve so it lands the dopamine peaks.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from . import config
from .camelot import harmonic_distance, transition_label


def _tempo_distance(t1: float, t2: float) -> float:
    """BPM distance with half/double-time equivalence, normalized 0..1.

    Lets a 75-BPM R&B track sit next to a 150-BPM house track (the bridge a
    club DJ uses) by treating x, 2x and x/2 as equivalent tempos.
    """
    if not t1 or not t2:
        return 1.0
    cands = [abs(t1 - t2), abs(t1 - 2 * t2), abs(2 * t1 - t2)]
    return min(min(cands) / config.TEMPO_CAP_BPM, 1.0)


def _target_curve(n: int) -> np.ndarray:
    """Rising envelope + sine waves -> multiple builds and drops across the set."""
    p = np.linspace(0, 1, n)
    envelope = 0.35 + 0.45 * p                      # overall lift across session
    waves = 0.18 * (0.5 - 0.5 * np.cos(2 * np.pi * config.ENERGY_WAVES * p))
    warmup = np.clip(p / 0.05, 0, 1)                # gentle first ~5%
    return np.clip((envelope * 0.7 + waves) * warmup + 0.1 * (1 - warmup), 0, 1)


def _step_cost(cur: pd.Series, cand: pd.Series, target_e: float) -> float:
    w = config.WEIGHTS
    key = harmonic_distance(cur["camelot"], cand["camelot"])
    tempo = _tempo_distance(cur["bpm"], cand["bpm"])
    # Boundary-aware energy: match the OUTRO of the current track to the INTRO of
    # the candidate (fall back to whole-song energy if the columns are absent).
    cur_out = cur.get("outro_energy_n", cur["energy_n"])
    cand_in = cand.get("intro_energy_n", cand["energy_n"])
    e_boundary = abs(cur_out - cand_in)
    e_curve = abs(cand["energy_n"] - target_e)
    groove = abs(cur["groove_n"] - cand["groove_n"])
    return (w["key"] * key + w["tempo"] * tempo + w["energy_boundary"] * e_boundary
            + w["energy_curve"] * e_curve + w["groove"] * groove)


def build_order(df: pd.DataFrame) -> list[str]:
    """Greedy nearest-neighbour path following the energy target curve."""
    n = len(df)
    target = _target_curve(n)
    ids = df.index.tolist()

    # start: the track closest to the warm-up target energy
    start = (df["energy_n"] - target[0]).abs().idxmin()
    order = [start]
    used = {start}

    for pos in range(1, n):
        cur = df.loc[order[-1]]
        te = target[pos]
        best_id, best_cost = None, float("inf")
        for tid in ids:
            if tid in used:
                continue
            c = _step_cost(cur, df.loc[tid], te)
            if c < best_cost:
                best_cost, best_id = c, tid
        order.append(best_id)
        used.add(best_id)
    return order


def _load_features() -> pd.DataFrame:
    if not config.FEATURES_PARQUET.exists():
        raise FileNotFoundError("Run analyze first (no features.parquet).")
    df = pd.read_parquet(config.FEATURES_PARQUET)
    # Guard against duplicate index labels: a duplicated id makes df.loc[id]
    # return a DataFrame, turning row values into Series and breaking the
    # scalar comparisons in the sequencer ("truth value of a Series is ambiguous").
    df = df[~df.index.duplicated(keep="first")]
    return df.dropna(subset=["camelot", "bpm", "energy_n", "groove_n"])


def result_from_df(df: pd.DataFrame) -> dict:
    """Sequence an analyzed DataFrame into the dashboard set payload."""
    if df.empty:
        raise ValueError("No analyzed tracks to sequence.")
    order = build_order(df)
    ordered = df.loc[order]

    tracks = []
    prev_cam = None
    for i, (tid, row) in enumerate(ordered.iterrows()):
        tracks.append({
            "pos": i,
            "id": tid,
            "uri": row.get("uri", f"spotify:track:{tid}"),
            "name": row.get("name", tid),
            "artists": row.get("artists", ""),
            "camelot": row["camelot"],
            "key_name": row.get("key_name", ""),
            "bpm": round(float(row["bpm"]), 1),
            "energy": round(float(row["energy_n"]), 3),
            "groove": round(float(row["groove_n"]), 3),
            "transition": transition_label(prev_cam, row["camelot"]) if prev_cam else "intro",
        })
        prev_cam = row["camelot"]

    # quality stats
    dists = [harmonic_distance(tracks[i - 1]["camelot"], tracks[i]["camelot"])
             for i in range(1, len(tracks))]
    compatible = sum(1 for d in dists if d <= 1.0)
    return {
        "count": len(tracks),
        "compatible_pct": round(100 * compatible / max(1, len(dists)), 1),
        "target_curve": [round(float(x), 3) for x in _target_curve(len(tracks))],
        "actual_curve": [t["energy"] for t in tracks],
        "tracks": tracks,
    }


def order_for_ids(track_ids: list[str]) -> tuple[dict, list[str], list[str]]:
    """Order the analyzed subset of a selected playlist.

    Returns (set_payload, present_ids_in_order, missing_ids). missing_ids are
    playlist tracks we have no local analysis for; the caller can still queue
    them (they just won't carry analytics).
    """
    df = _load_features()
    # de-dupe while preserving order — a playlist can list the same track twice.
    seen: set[str] = set()
    uniq = [t for t in track_ids if not (t in seen or seen.add(t))]
    present = [t for t in uniq if t in df.index]
    missing = [t for t in uniq if t not in df.index]
    result = result_from_df(df.loc[present])
    return result, [t["id"] for t in result["tracks"]], missing


def run() -> dict:
    """Offline: sequence the whole analyzed library to data/set_order.json."""
    result = result_from_df(_load_features())
    config.SET_ORDER_JSON.write_text(json.dumps(result, indent=2))
    print(f"Sequenced {result['count']} tracks. "
          f"{result['compatible_pct']}% of transitions are key-compatible.")
    print(f"Saved -> {config.SET_ORDER_JSON.name}")
    return result
