"""FastAPI JSON/WebSocket API for the DJ-Set dashboard.

Pure API (the UI is the separate Next.js app). Responsibilities:
- Spotify OAuth (app-served /auth/login + /auth/callback).
- List playlists, select one -> sequence its analyzed tracks -> play ordered URIs.
- Coverage + download/analyze jobs (so the user can fill in missing analysis).
- A background loop that polls playback and pushes now-playing + job progress
  to every connected dashboard over a WebSocket.
"""
from __future__ import annotations

import asyncio
import json

import pandas as pd
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from . import auth, config, jobs, sequence, spotify_client

app = FastAPI(title="DJ Set API")
app.add_middleware(
    CORSMiddleware, allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"], allow_headers=["*"], allow_credentials=True,
)

STATE: dict = {
    "now": None, "pos": None, "set": None, "missing": [],
    "set_dirty": False, "error": None,
}
_loop: asyncio.AbstractEventLoop | None = None


# ---------------------------------------------------------------- websockets
class Hub:
    def __init__(self):
        self.active: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def broadcast(self, msg: dict):
        for ws in list(self.active):
            try:
                await ws.send_json(msg)
            except Exception:
                self.disconnect(ws)


hub = Hub()


def _emit_threadsafe(msg: dict):
    """Broadcast from a worker thread (job progress) into the event loop."""
    if _loop:
        asyncio.run_coroutine_threadsafe(hub.broadcast(msg), _loop)


def _features_for(track_id: str) -> dict:
    cache = config.FEATURES_DIR / f"{track_id}.json"
    return json.loads(cache.read_text()) if cache.exists() else {}


def _save_active_set():
    """Persist the active set so a container restart continues the same playlist."""
    try:
        config.ACTIVE_SET_JSON.write_text(
            json.dumps({"set": STATE["set"], "missing": STATE["missing"]})
        )
    except Exception as e:
        STATE["error"] = f"could not save set: {e}"


def _restore_active_set():
    """Reload the last selected set on startup (pos is re-derived from playback)."""
    if config.ACTIVE_SET_JSON.exists():
        try:
            data = json.loads(config.ACTIVE_SET_JSON.read_text())
            STATE["set"] = data.get("set")
            STATE["missing"] = data.get("missing", [])
            STATE["set_dirty"] = bool(STATE["set"])
        except Exception:
            pass


def _set_payload() -> dict:
    s = STATE["set"]
    return {"type": "set", "count": s["count"], "compatible_pct": s["compatible_pct"],
            "target_curve": s["target_curve"], "actual_curve": s["actual_curve"],
            "tracks": s["tracks"], "missing": len(STATE["missing"])}


def _now_payload() -> dict:
    s = STATE["set"]
    upnext = s["tracks"][STATE["pos"] + 1: STATE["pos"] + 6] if (s and STATE["pos"] is not None) else []
    return {"type": "now", "now": STATE["now"], "pos": STATE["pos"],
            "upnext": upnext, "error": STATE["error"]}


async def dj_loop():
    while True:
        try:
            if STATE["set_dirty"] and STATE["set"]:
                STATE["set_dirty"] = False
                await hub.broadcast(_set_payload())

            if auth.is_authed():
                sp = await asyncio.to_thread(spotify_client.client)
                now = await asyncio.to_thread(spotify_client.now_playing, sp)
                if now:
                    if STATE["set"]:
                        matched = {t["id"]: t for t in STATE["set"]["tracks"]}.get(now["id"])
                        if matched:
                            STATE["pos"] = matched["pos"]
                            now.update({k: matched[k] for k in
                                        ("camelot", "bpm", "energy", "key_name", "transition")})
                    now["curves"] = _features_for(now["id"])
                    STATE["now"] = now
                STATE["error"] = None
            else:
                STATE["error"] = "not_authenticated"
            await hub.broadcast(_now_payload())
        except Exception as e:
            STATE["error"] = str(e)
            await hub.broadcast(_now_payload())
        await asyncio.sleep(1.0)


@app.on_event("startup")
async def _startup():
    global _loop
    _loop = asyncio.get_running_loop()
    _restore_active_set()
    asyncio.create_task(dj_loop())


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await hub.connect(ws)
    try:
        if STATE["set"]:
            await ws.send_json(_set_payload())
        await ws.send_json(_now_payload())
        await ws.send_json({"type": "job", **jobs.snapshot()})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(ws)
    except Exception:
        hub.disconnect(ws)


# --------------------------------------------------------------------- auth
@app.get("/auth/login")
def auth_login():
    return RedirectResponse(auth.authorize_url())


@app.get("/auth/callback")
def auth_callback(code: str | None = None, error: str | None = None):
    if error:
        return RedirectResponse(f"{config.WEB_APP_URL}/settings?auth=error")
    if code:
        auth.exchange_code(code)
    return RedirectResponse(f"{config.WEB_APP_URL}/settings?auth=ok")


@app.get("/api/auth/status")
def auth_status():
    return {"authenticated": auth.is_authed()}


# ----------------------------------------------------------------- playlists
@app.get("/api/playlists")
def api_playlists():
    try:
        return {"playlists": spotify_client.list_playlists(spotify_client.client())}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/select/{playlist_id}")
def api_select(playlist_id: str):
    try:
        sp = spotify_client.client()
        ids = spotify_client.playlist_track_ids(sp, playlist_id)
        if not ids:
            return JSONResponse({"error": "playlist has no tracks"}, status_code=400)
        result, ordered_ids, missing = sequence.order_for_ids(ids)
        # attach album art so the up-next queue can show thumbnails
        art = spotify_client.album_art_map(sp, ordered_ids)
        for t in result["tracks"]:
            t["album_art"] = art.get(t["id"])
        STATE["set"], STATE["missing"], STATE["pos"] = result, missing, None
        STATE["set_dirty"] = True
        _save_active_set()
        uris = [f"spotify:track:{i}" for i in ordered_ids + missing]
        spotify_client.start_playback_uris(sp, uris)
        return {"ok": True, "ordered": len(ordered_ids), "missing": len(missing),
                "compatible_pct": result["compatible_pct"]}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/control/{action}")
def api_control(action: str):
    try:
        sp = spotify_client.client()
        if action == "play":
            sp.start_playback(device_id=spotify_client.pick_device(sp))
        elif action == "pause":
            sp.pause_playback()
        elif action == "skip":
            sp.next_track()
        elif action == "prev":
            sp.previous_track()
        else:
            return JSONResponse({"error": f"unknown action {action}"}, status_code=400)
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ------------------------------------------------------------ coverage / jobs
def _coverage(track_ids: list[str] | None = None) -> dict:
    """Per-track download/analysis status, library-wide or for a subset."""
    meta = pd.read_csv(config.find_csv())
    meta["id"] = meta["Track URI"].map(config.track_id)
    meta = meta.set_index("id")
    downloaded = {p.stem for p in config.AUDIO_DIR.glob("*.*")}
    analyzed = {p.stem for p in config.FEATURES_DIR.glob("*.json")}

    ids = track_ids if track_ids is not None else list(meta.index)
    tracks = []
    for tid in ids:
        in_lib = tid in meta.index
        status = ("analyzed" if tid in analyzed else
                  "downloaded" if tid in downloaded else
                  "missing" if in_lib else "not_in_library")
        tracks.append({
            "id": tid,
            "name": str(meta.loc[tid, "Track Name"]) if in_lib else tid,
            "artists": str(meta.loc[tid, "Artist Name(s)"]).replace(";", ", ") if in_lib else "",
            "status": status,
        })
    return {
        "total": len(ids),
        "downloaded": sum(1 for t in tracks if t["status"] in ("downloaded", "analyzed")),
        "analyzed": sum(1 for t in tracks if t["status"] == "analyzed"),
        "tracks": tracks,
    }


@app.get("/api/coverage")
def api_coverage(playlist_id: str | None = None):
    try:
        ids = None
        if playlist_id:
            ids = spotify_client.playlist_track_ids(spotify_client.client(), playlist_id)
        return _coverage(ids)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/jobs/status")
def api_job_status():
    return jobs.snapshot()


@app.post("/api/jobs/{job}")
def api_job_start(job: str, scope: str = "all", playlist_id: str | None = None):
    if job not in ("download", "analyze"):
        return JSONResponse({"error": f"unknown job {job}"}, status_code=400)
    return jobs.start(job, scope=scope, playlist_id=playlist_id, emit=_emit_threadsafe)


def serve(host: str = "0.0.0.0", port: int = 8000):
    import uvicorn
    print(f"API -> http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="warning")
