"""Spotify playlist listing and playback control (Premium auto-DJ).

The Web API can't beatmatch or crossfade audio — it controls *which* track
plays and *when*. We start playback with the DJ-ordered URI list (no new
playlist is created) and let Spotify's in-app Crossfade do the physical blend.
Auth lives in auth.py; this module just consumes a ready client.
"""
from __future__ import annotations

import spotipy

from .auth import get_client

# Sentinel id for the "Liked Songs" virtual playlist.
LIKED_SONGS_ID = "__liked__"


def client() -> spotipy.Spotify:
    sp = get_client()
    if sp is None:
        raise RuntimeError("Not authenticated with Spotify. Visit /auth/login.")
    return sp


def pick_device(sp: spotipy.Spotify) -> str | None:
    devices = sp.devices().get("devices", [])
    if not devices:
        return None
    active = next((d for d in devices if d["is_active"]), None)
    return (active or devices[0])["id"]


def list_playlists(sp: spotipy.Spotify) -> list[dict]:
    """The user's playlists for the picker, with Liked Songs pinned first."""
    liked_total = sp.current_user_saved_tracks(limit=1).get("total", 0)
    out = [{
        "id": LIKED_SONGS_ID, "name": "Liked Songs", "count": liked_total,
        "image": None, "owner": "you",
    }]
    res = sp.current_user_playlists(limit=50)
    while res:
        for p in res["items"]:
            if not p:
                continue
            out.append({
                "id": p["id"], "name": p["name"],
                "count": p["tracks"]["total"],
                "image": p["images"][0]["url"] if p.get("images") else None,
                "owner": p["owner"]["display_name"],
            })
        res = sp.next(res) if res.get("next") else None
    return out


def playlist_track_ids(sp: spotipy.Spotify, playlist_id: str) -> list[str]:
    if playlist_id == LIKED_SONGS_ID:
        return _liked_track_ids(sp)
    ids, res = [], sp.playlist_items(
        playlist_id, fields="items(track(id)),next", additional_types=["track"])
    while res:
        for it in res["items"]:
            tr = it.get("track")
            if tr and tr.get("id"):
                ids.append(tr["id"])
        res = sp.next(res) if res.get("next") else None
    return ids


def album_art_map(sp: spotipy.Spotify, ids: list[str]) -> dict[str, str | None]:
    """track_id -> smallest album-art URL, for the up-next thumbnails."""
    art: dict[str, str | None] = {}
    for i in range(0, len(ids), 50):  # Spotify caps /tracks at 50 ids
        for t in sp.tracks(ids[i:i + 50]).get("tracks", []):
            if t and t.get("id"):
                imgs = t["album"]["images"]
                art[t["id"]] = imgs[-1]["url"] if imgs else None
    return art


def _liked_track_ids(sp: spotipy.Spotify) -> list[str]:
    ids, res = [], sp.current_user_saved_tracks(limit=50)
    while res:
        for it in res["items"]:
            tr = it.get("track")
            if tr and tr.get("id"):
                ids.append(tr["id"])
        res = sp.next(res) if res.get("next") else None
    return ids


def start_playback_uris(sp: spotipy.Spotify, uris: list[str],
                        device_id: str | None = None) -> None:
    """Play the given ordered track URIs on the active (desktop) device.

    No playlist is created — Spotify just plays the URI list in order.
    """
    device_id = device_id or pick_device(sp)
    if not device_id:
        raise RuntimeError("No active Spotify device. Open the Spotify desktop app and play once.")
    sp.start_playback(device_id=device_id, uris=uris[:700])  # Web API context cap


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
