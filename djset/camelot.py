"""Camelot wheel: key detection helpers and harmonic distance.

The Camelot system maps the 24 musical keys onto a clock (1-12) with an inner
ring (A = minor) and outer ring (B = major). DJs mix between adjacent codes
because those keys share notes and blend without clashing.
"""
from __future__ import annotations

import numpy as np

# pitch class (0=C .. 11=B) -> Camelot code, for major (B ring) and minor (A ring)
PITCH_TO_CAMELOT_MAJOR = {
    0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B",
    6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B",
}
PITCH_TO_CAMELOT_MINOR = {
    0: "5A", 1: "12A", 2: "7A", 3: "2A", 4: "9A", 5: "4A",
    6: "11A", 7: "6A", 8: "1A", 9: "8A", 10: "3A", 11: "10A",
}

KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Schmuckler key profiles (major / minor) for chroma correlation.
_MAJOR_PROFILE = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_MINOR_PROFILE = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)


def camelot_code(pitch_class: int, mode: int) -> str:
    """mode: 1 = major (B ring), 0 = minor (A ring)."""
    table = PITCH_TO_CAMELOT_MAJOR if mode == 1 else PITCH_TO_CAMELOT_MINOR
    return table[int(pitch_class) % 12]


def key_name(pitch_class: int, mode: int) -> str:
    return f"{KEY_NAMES[int(pitch_class) % 12]} {'maj' if mode == 1 else 'min'}"


def estimate_key(chroma_mean: np.ndarray) -> tuple[int, int, float]:
    """Estimate (pitch_class, mode, confidence) from a mean chroma vector.

    Correlates the 12-bin chroma against rotated major/minor profiles and
    returns the best match. confidence is the top correlation (0..1-ish).
    """
    chroma = np.asarray(chroma_mean, dtype=float)
    if chroma.sum() <= 0:
        return 0, 1, 0.0
    chroma = chroma / chroma.sum()

    best = (-2.0, 0, 1)
    for pc in range(12):
        maj = np.corrcoef(np.roll(_MAJOR_PROFILE, pc), chroma)[0, 1]
        minr = np.corrcoef(np.roll(_MINOR_PROFILE, pc), chroma)[0, 1]
        if maj > best[0]:
            best = (maj, pc, 1)
        if minr > best[0]:
            best = (minr, pc, 0)
    conf, pc, mode = best
    return pc, mode, float(max(0.0, conf))


def _parse(code: str) -> tuple[int, str]:
    code = code.strip().upper()
    return int(code[:-1]), code[-1]


def harmonic_distance(a: str, b: str) -> float:
    """DJ-style harmonic incompatibility between two Camelot codes (0 = ideal).

    same key           -> 0.0
    relative maj/minor -> 0.5   (same number, opposite letter)
    neighbour (+/-1)   -> 1.0   (same letter, one hour on the wheel)
    energy mix (+/-2)  -> 2.0
    further clashes     scale up toward ~6.
    """
    if not a or not b:
        return 3.0
    n1, l1 = _parse(a)
    n2, l2 = _parse(b)
    ring = abs(n1 - n2)
    ring = min(ring, 12 - ring)  # circular distance 0..6
    if l1 == l2:
        return float(ring)
    if ring == 0:
        return 0.5
    return float(ring + 2)


def transition_label(a: str, b: str) -> str:
    """Human-friendly description of a key transition for the dashboard."""
    if not a or not b:
        return "key unknown"
    if a == b:
        return f"{a}→{b} perfect"
    n1, l1 = _parse(a)
    n2, l2 = _parse(b)
    ring = min(abs(n1 - n2), 12 - abs(n1 - n2))
    if l1 != l2 and ring == 0:
        return f"{a}→{b} relative"
    if l1 == l2 and ring == 1:
        return f"{a}→{b} neighbour"
    if l1 == l2 and ring == 2:
        return f"{a}→{b} energy mix"
    return f"{a}→{b}"
