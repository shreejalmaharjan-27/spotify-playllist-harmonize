"""FastAPI dashboard server + auto-DJ background loop.

Serves the static dashboard and a small REST/JSON API. A background task polls
Spotify playback once a second, matches the playing track to the DJ-ordered set,
and exposes now-playing + up-next + analytics for the web page.
"""
from __future__ import annotations

import asyncio
import json

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config, spotify_client

app = FastAPI(title="DJ Set Dashboard")

STATE: dict = {
    "now": None,          # current playback (Spotify) merged with our analysis
    "pos": None,          # index in the ordered set, if matched
    "set": None,          # the loaded set_order.json
    "features": {},       # id -> per-track curves (energy_curve, waveform)
    "error": None,
    "device": None,
}
_sp = None


def _features_for(track_id: str) -> dict:
    cache = config.FEATURES_DIR / f"{track_id}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    return {}


def _connect():
    global _sp
    if _sp is None:
        _sp = spotify_client.client()
        STATE["set"] = spotify_client.load_set()
    return _sp


async def dj_loop():
    """Poll playback ~1s; track our position in the ordered set."""
    while True:
        try:
            sp = _connect()
            now = spotify_client.now_playing(sp)
            if now:
                by_id = {t["id"]: t for t in STATE["set"]["tracks"]}
                matched = by_id.get(now["id"])
                if matched:
                    STATE["pos"] = matched["pos"]
                    now.update({
                        "camelot": matched["camelot"], "bpm": matched["bpm"],
                        "energy": matched["energy"], "key_name": matched["key_name"],
                        "transition": matched["transition"],
                    })
                now["curves"] = _features_for(now["id"])
                STATE["now"] = now
                STATE["error"] = None
        except Exception as e:  # keep the loop alive; surface to UI
            STATE["error"] = str(e)
        await asyncio.sleep(1.0)


@app.on_event("startup")
async def _startup():
    asyncio.create_task(dj_loop())


@app.get("/api/set")
def api_set():
    if STATE["set"] is None:
        try:
            STATE["set"] = spotify_client.load_set()
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=404)
    s = STATE["set"]
    return {"count": s["count"], "compatible_pct": s["compatible_pct"],
            "target_curve": s["target_curve"], "actual_curve": s["actual_curve"],
            "tracks": s["tracks"]}


@app.get("/api/now")
def api_now():
    s = STATE["set"]
    upnext = []
    if s and STATE["pos"] is not None:
        upnext = s["tracks"][STATE["pos"] + 1: STATE["pos"] + 6]
    return {"now": STATE["now"], "pos": STATE["pos"], "upnext": upnext,
            "error": STATE["error"]}


@app.post("/api/control/{action}")
def api_control(action: str):
    try:
        sp = _connect()
        if action == "play":
            sp.start_playback(device_id=spotify_client.pick_device(sp))
        elif action == "pause":
            sp.pause_playback()
        elif action == "skip":
            sp.next_track()
        elif action == "start":
            spotify_client.start_playback(sp)
        else:
            return JSONResponse({"error": f"unknown action {action}"}, status_code=400)
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# static dashboard (mounted last so /api/* wins)
app.mount("/", StaticFiles(directory=str(config.WEB_DIR), html=True), name="web")


def serve(host: str = "127.0.0.1", port: int = 8000):
    import uvicorn
    print(f"Dashboard -> http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="warning")
