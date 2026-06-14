"""Shared configuration: paths, env loading, and scoring weights.

The whole project keys off a single project root so the CLI, server, and
worker processes all agree on where the cache lives.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# --- data layout -----------------------------------------------------------
# DJSET_DATA lets Docker point the cache at a bind-mounted volume (/data).
DATA = Path(os.environ.get("DJSET_DATA", ROOT / "data"))
AUDIO_DIR = DATA / "audio"
FEATURES_DIR = DATA / "features"
FEATURES_PARQUET = DATA / "features.parquet"
SET_ORDER_JSON = DATA / "set_order.json"
ACTIVE_SET_JSON = DATA / "active_set.json"   # dashboard's current set, survives restarts
DOWNLOAD_LOG = DATA / "download_log.json"
TOKEN_CACHE = DATA / ".spotipy_cache"

# Web app origins allowed to call this API (comma-separated env override).
CORS_ORIGINS = os.environ.get(
    "DJSET_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")
# Where /auth/callback redirects back to after a successful login.
WEB_APP_URL = os.environ.get("DJSET_WEB_URL", "http://localhost:3000")

# Audio analysis settings
SAMPLE_RATE = 22050          # mono resample target for librosa
ENERGY_CURVE_POINTS = 100    # downsampled per-track energy curve for the UI
WAVEFORM_POINTS = 400        # downsampled waveform peaks for the UI
ANALYZE_MAX_SECONDS = 420    # only load the first ~7 min (covers songs; caps mixes)
ANALYZE_TIMEOUT_SEC = 90     # hard per-file cap; skip a track that hangs ffmpeg
INTRO_OUTRO_POINTS = 8       # curve points (~first/last 8%) used as intro/outro energy

# Download settings
AUDIO_EXT = "m4a"
AUDIO_QUALITY = "160K"       # "medium" quality
DURATION_TOLERANCE = 0.15    # reject yt matches off by >15% from Spotify length

# --- DJ ordering weights ---------------------------------------------------
# Higher weight => the sequencer cares more about keeping that axis smooth.
WEIGHTS = {
    "key": 1.0,        # Camelot harmonic distance (the seamless-blend axis)
    "tempo": 0.6,      # BPM proximity (with half/double-time equivalence)
    "energy_curve": 1.2,    # follow the target build/drop arc (the dopamine)
    "energy_boundary": 1.0, # match current OUTRO energy to candidate INTRO energy
    "groove": 0.4,     # danceability/pulse-clarity continuity
}
TEMPO_CAP_BPM = 12.0   # tempo difference (BPM) that counts as "fully far"
ENERGY_WAVES = 6       # number of build/drop cycles across the whole set


def find_csv() -> Path:
    """Locate the library CSV (case-insensitive, prefers EN2).

    Looks in the data dir first (so it can live in the Docker bind mount),
    then the project root.
    """
    search_dirs = [DATA, ROOT]
    candidates = [c for d in search_dirs if d.exists() for c in sorted(d.glob("*.csv"))]
    for name in ("EN2.csv", "en2.csv"):
        for c in candidates:
            if c.name.lower() == name.lower():
                return c
    if candidates:
        return candidates[0]
    raise FileNotFoundError("No library CSV found in data dir or project root")


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
    os.environ.setdefault("SPOTIPY_REDIRECT_URI", "http://127.0.0.1:8000/auth/callback")


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
