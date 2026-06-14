# DJ-Set Auto-Mixer

Turns your Spotify playlists into a **harmonically-mixed DJ set** (Camelot key matching +
half/double-time tempo bridges + a build-and-drop energy arc), drives playback through it, and
shows a clean **Next.js dashboard** (now-playing, up-next, energy arc, waveform, Camelot wheel)
that's nice to watch on a second monitor.

The Spotify Web API can't beatmatch/crossfade audio — the "DJ magic" here is the **ordering** and
the **visuals**. Turn on Spotify's in-app **Crossfade (~8–12s)** for the physical blend. You need
**Spotify Premium** and the **desktop app open** (active playback device).

## Architecture

```
browser ──HTTP/WS──> api  (FastAPI :8000)  ──bind mount ./data:/data──> audio, features, token
   │                       librosa pipeline · Spotify OAuth + control · jobs
   └──────────────────> web (Next.js :3000)  shadcn UI; calls api via NEXT_PUBLIC_API_URL
```

The audio + analysis + auth token all live in **`./data` on the host** (a Docker bind mount), never
in the image.

## Run with Docker (recommended)

```bash
docker compose up --build      # web → http://localhost:3000, api → http://localhost:8000
```

Put your library export CSV (e.g. `EN2.csv`) in `./data/`. Then in the app:

1. **Settings → Connect Spotify.** First add `http://127.0.0.1:8000/auth/callback` to your Spotify
   app's Redirect URIs (use `127.0.0.1`, not `localhost`).
2. **Library →** Download all, then Analyze all (heavy one-time jobs, cached + resumable, shown with
   live progress). DJ info only appears for *analyzed* tracks.
3. **Now Playing → Choose playlist** (your playlists + Liked Songs). It sequences the analyzed
   tracks and plays the ordered set on your desktop app — **no new playlist is created**.

## Run locally without Docker

```bash
# one-time conda env (pinned stack — see "Apple Silicon" below)
conda env create -f environment.yml

# backend (terminal 1)
conda run -n djset uvicorn djset.server:app --port 8000
# frontend (terminal 2)
cd frontend && pnpm install && pnpm dev      # http://localhost:3000
```

The CLI still works for headless runs: `conda run -n djset python cli.py {download,analyze,sequence}`
(`--limit N` to test on a subset).

## How the ordering works

- **Key** — detected from the audio (chroma) → Camelot code; adjacent tracks stay harmonically
  compatible (same / relative / ±1 neighbour on the wheel).
- **Tempo** — BPM proximity with **half/double-time equivalence**, so a 75-BPM R&B track can sit
  next to a 150-BPM house track (the bridge club DJs use).
- **Energy arc** — a rising envelope + sine waves create multiple build-ups and drops across the
  session instead of a flat sort, for the dopamine peaks.
- A greedy nearest-neighbour path minimises a weighted "DJ distance" while following the arc.

## Apple Silicon (arm64) note

`librosa.beat.beat_track` and CQT chroma use numba-JIT code that **segfaults** on arm64 when two
OpenMP runtimes collide (the `openmp_*` OpenBLAS build + llvm-openmp, made worse by a pip-installed
numpy bundling its own OpenBLAS). Fixes baked in:

1. `environment.yml` pins the **pthreads** OpenBLAS (`libopenblas=*=*pthreads*`) + **stable numba
   0.61**, single channel — never `pip install numpy` over it. The Docker API image reuses it.
2. `analyze.py` uses `librosa.feature.tempo` instead of `beat_track`'s crashing DP step.

Refs: [llvm#61682](https://github.com/llvm/llvm-project/issues/61682),
[scipy#15050](https://github.com/scipy/scipy/issues/15050),
[anaconda-issues#13221](https://github.com/ContinuumIO/anaconda-issues/issues/13221).
