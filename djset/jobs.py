"""In-process job manager for long-running download / analyze tasks.

One job runs at a time in a worker thread. Progress is pushed to a callback
(the server wires this to the WebSocket broadcast) and also kept as the current
status so a freshly-connected dashboard can render immediately.
"""
from __future__ import annotations

import threading
import traceback
from typing import Callable

from . import analyze, download, spotify_client

# latest job status, mirrored to clients
STATE: dict = {
    "job": None,        # "download" | "analyze" | None
    "status": "idle",   # idle | running | done | error
    "done": 0,
    "total": 0,
    "message": "",
}
_lock = threading.Lock()
_thread: threading.Thread | None = None


def is_running() -> bool:
    return STATE["status"] == "running"


def snapshot() -> dict:
    return dict(STATE)


def _set(**kw):
    STATE.update(kw)


def start(job: str, scope: str = "all", playlist_id: str | None = None,
          emit: Callable[[dict], None] | None = None) -> dict:
    """Kick off a download/analyze job. scope: 'all' or 'playlist'."""
    global _thread
    with _lock:
        if is_running():
            return {"error": "a job is already running", **snapshot()}

        _set(job=job, status="running", done=0, total=0,
             message="starting…")

        def progress(done, total, msg):
            _set(done=done, total=total, message=msg)
            if emit:
                emit({"type": "job", **snapshot()})

        def worker():
            try:
                track_ids = None
                if scope == "playlist" and playlist_id:
                    sp = spotify_client.client()
                    track_ids = spotify_client.playlist_track_ids(sp, playlist_id)
                if job == "download":
                    download.run(track_ids=track_ids, on_progress=progress)
                elif job == "analyze":
                    analyze.run(track_ids=track_ids, on_progress=progress)
                else:
                    raise ValueError(f"unknown job {job}")
                _set(status="done", message="complete")
            except Exception as e:
                traceback.print_exc()
                _set(status="error", message=str(e))
            if emit:
                emit({"type": "job", **snapshot()})

        _thread = threading.Thread(target=worker, daemon=True)
        _thread.start()
    return snapshot()
