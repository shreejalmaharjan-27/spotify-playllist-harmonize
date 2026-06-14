"""Spotify OAuth — Authorization Code flow driven by our own FastAPI routes.

Unlike spotipy's default helper (which spins up a local server and opens a
browser), we expose /auth/login and /auth/callback ourselves. The redirect URI
is the app itself (http://127.0.0.1:8000/auth/callback), which works the same
locally and inside Docker. The refresh token is cached in the data dir so it
survives container rebuilds via the bind mount.
"""
from __future__ import annotations

import spotipy
from spotipy.oauth2 import SpotifyOAuth

from . import config

SCOPE = (
    "playlist-read-private playlist-read-collaborative "
    "user-library-read "
    "user-modify-playback-state user-read-playback-state "
    "user-read-currently-playing"
)


def _oauth() -> SpotifyOAuth:
    config.load_env()
    config.ensure_dirs()
    return SpotifyOAuth(
        scope=SCOPE,
        cache_path=str(config.TOKEN_CACHE),
        open_browser=False,
    )


def authorize_url() -> str:
    return _oauth().get_authorize_url()


def exchange_code(code: str) -> None:
    """Exchange the ?code from the callback for tokens and cache them."""
    _oauth().get_access_token(code, as_dict=False, check_cache=False)


def is_authed() -> bool:
    oauth = _oauth()
    token = oauth.cache_handler.get_cached_token()
    return bool(token) and not oauth.is_token_expired(token)


def get_client() -> spotipy.Spotify | None:
    """A ready Spotify client from the cached token, or None if not logged in."""
    oauth = _oauth()
    token = oauth.validate_token(oauth.cache_handler.get_cached_token())
    if not token:
        return None
    return spotipy.Spotify(auth=token["access_token"], requests_timeout=15, retries=3)
