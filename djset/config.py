"""Shared configuration: paths, env loading, and scoring weights.

The whole project keys off a single project root so the CLI, server, and
worker processes all agree on where the cache lives.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# --- data layout -----------------------------------------------------------
DATA = ROOT / "data"
AUDIO_DIR = DATA / "audio"
FEATURES_DIR = DATA / "features"
FEATURES_PARQUET = DATA / "features.parquet"
SET_ORDER_JSON = DATA / "set_order.json"
DOWNLOAD_LOG = DATA / "download_log.json"
WEB_DIR = ROOT / "web"

# Audio analysis settings
SAMPLE_RATE = 22050          # mono resample target for librosa
ENERGY_CURVE_POINTS = 100    # downsampled per-track energy curve for the UI
WAVEFORM_POINTS = 400        # downsampled waveform peaks for the UI

# Download settings
AUDIO_EXT = "m4a"
AUDIO_QUALITY = "160K"       # "medium" quality
DURATION_TOLERANCE = 0.15    # reject yt matches off by >15% from Spotify length

# --- DJ ordering weights ---------------------------------------------------
# Higher weight => the sequencer cares more about keeping that axis smooth.
WEIGHTS = {
    "key": 1.0,        # Camelot harmonic distance (the seamless-blend axis)
    "tempo": 0.6,      # BPM proximity (with half/double-time equivalence)
    "energy_curve": 1.2,   # follow the target build/drop arc (the dopamine)
    "energy_smooth": 0.7,  # avoid jarring energy jumps between neighbours
    "groove": 0.4,     # danceability/pulse-clarity continuity
}
TEMPO_CAP_BPM = 12.0   # tempo difference (BPM) that counts as "fully far"
ENERGY_WAVES = 6       # number of build/drop cycles across the whole set


def find_csv() -> Path:
    """Locate the playlist export CSV (case-insensitive, prefers EN2)."""
    candidates = sorted(ROOT.glob("*.csv"))
    for name in ("EN2.csv", "en2.csv"):
        for c in candidates:
            if c.name.lower() == name.lower():
                return c
    if candidates:
        return candidates[0]
    raise FileNotFoundError("No CSV found in project root")


def load_env() -> None:
    """Load .env into os.environ and map SPOTIFY_* -> SPOTIPY_* aliases.

    spotipy reads SPOTIPY_CLIENT_ID / SPOTIPY_CLIENT_SECRET / SPOTIPY_REDIRECT_URI.
    The user's .env names them SPOTIFY_*, so we bridge both.
    """
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

    alias = {
        "SPOTIPY_CLIENT_ID": "SPOTIFY_CLIENT_ID",
        "SPOTIPY_CLIENT_SECRET": "SPOTIFY_CLIENT_SECRET",
    }
    for spotipy_key, our_key in alias.items():
        if not os.environ.get(spotipy_key) and os.environ.get(our_key):
            os.environ[spotipy_key] = os.environ[our_key]
    os.environ.setdefault("SPOTIPY_REDIRECT_URI", "http://127.0.0.1:8888/callback")


def track_id(uri: str) -> str:
    """spotify:track:ABC -> ABC (also accepts a bare id or open.spotify URL)."""
    uri = str(uri).strip()
    if uri.startswith("spotify:track:"):
        return uri.split(":")[-1]
    if "open.spotify.com/track/" in uri:
        return uri.split("/track/")[-1].split("?")[0]
    return uri


def ensure_dirs() -> None:
    for d in (DATA, AUDIO_DIR, FEATURES_DIR):
        d.mkdir(parents=True, exist_ok=True)
