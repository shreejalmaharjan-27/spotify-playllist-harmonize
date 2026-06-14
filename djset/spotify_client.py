"""Spotify auth, playlist creation, and playback control (Premium auto-DJ).

The Web API can't beatmatch or crossfade audio — it controls *which* track
plays and *when*. We start playback with the DJ-ordered URI list and let
Spotify's in-app Crossfade setting do the physical blend.
"""
from __future__ import annotations

import json

import spotipy
from spotipy.oauth2 import SpotifyOAuth

from . import config

SCOPE = (
    "playlist-modify-public playlist-modify-private "
    "user-modify-playback-state user-read-playback-state "
    "user-read-currently-playing"
)


def client() -> spotipy.Spotify:
    config.load_env()
    auth = SpotifyOAuth(
        scope=SCOPE,
        cache_path=str(config.ROOT / ".spotipy_cache"),
        open_browser=True,
    )
    return spotipy.Spotify(auth_manager=auth, requests_timeout=15, retries=3)


def load_set() -> dict:
    if not config.SET_ORDER_JSON.exists():
        raise FileNotFoundError("Run sequence first (no set_order.json).")
    return json.loads(config.SET_ORDER_JSON.read_text())


def pick_device(sp: spotipy.Spotify) -> str | None:
    devices = sp.devices().get("devices", [])
    if not devices:
        return None
    active = next((d for d in devices if d["is_active"]), None)
    return (active or devices[0])["id"]


def create_playlist(sp: spotipy.Spotify, name: str = "DJ Set (harmonic)") -> str:
    data = load_set()
    uris = [t["uri"] for t in data["tracks"]]
    user_id = sp.current_user()["id"]
    pl = sp.user_playlist_create(
        user=user_id, name=name, public=True,
        description=f"Harmonic DJ ordering of {len(uris)} tracks "
                    f"({data['compatible_pct']}% key-compatible). Turn on Crossfade ~10s.",
    )
    pid = pl["id"]
    for i in range(0, len(uris), 100):
        sp.playlist_add_items(pid, uris[i:i + 100])
    print(f"Created playlist '{name}' with {len(uris)} tracks: {pl['external_urls']['spotify']}")
    return pid


def start_playback(sp: spotipy.Spotify, device_id: str | None = None,
                   start_pos: int = 0) -> None:
    data = load_set()
    uris = [t["uri"] for t in data["tracks"]][start_pos:]
    device_id = device_id or pick_device(sp)
    if not device_id:
        raise RuntimeError("No active Spotify device. Open the Spotify desktop app and play once.")
    # Web API caps context size; 700+ URIs is fine in practice for uris=.
    sp.start_playback(device_id=device_id, uris=uris[:700])
    print(f"Playback started on device {device_id} at position {start_pos}.")


def now_playing(sp: spotipy.Spotify) -> dict | None:
    cur = sp.current_playback()
    if not cur or not cur.get("item"):
        return None
    item = cur["item"]
    return {
        "uri": item["uri"],
        "id": item["id"],
        "name": item["name"],
        "artists": ", ".join(a["name"] for a in item["artists"]),
        "album_art": (item["album"]["images"][0]["url"] if item["album"]["images"] else None),
        "progress_ms": cur.get("progress_ms", 0),
        "duration_ms": item.get("duration_ms", 0),
        "is_playing": cur.get("is_playing", False),
    }
