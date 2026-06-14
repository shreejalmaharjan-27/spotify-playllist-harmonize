# DJ-Set Auto-Mixer + Live Dashboard

Turns ~825 favourite songs into a **harmonically-mixed DJ set** (Camelot key matching +
half/double-time tempo bridges + a build-and-drop energy arc), drives Spotify playback through
it, and shows a live **second-monitor dashboard** with now-playing, up-next, the set's energy
arc, a waveform, and a Camelot wheel.

The Spotify Web API can't beatmatch/crossfade audio — the "DJ magic" here is the **ordering**
and the **visuals**. Turn on Spotify's in-app **Crossfade (~8–12s)** for the physical blend.

## Setup

```bash
# one-time env (stable numba + pthreads OpenBLAS — see "Apple Silicon" below)
conda create -y -n djset --override-channels -c conda-forge \
  python=3.11 "libopenblas=*=*pthreads*" "numba=0.61" "numpy=2.0" librosa pandas pyarrow
conda run -n djset pip install soundfile spotipy fastapi uvicorn yt-dlp mutagen
```

`.env` holds the Spotify app credentials (already present):
```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIPY_REDIRECT_URI=http://127.0.0.1:8888/callback
```
> Use `127.0.0.1`, not `localhost` — Spotify rejects `localhost` as "not secure". Add the exact
> same URI in your app's dashboard (Settings → Redirect URIs).

## Pipeline (each stage is cached / resumable)

```bash
conda run -n djset python cli.py download   # yt-dlp each song (medium quality) -> data/audio/
conda run -n djset python cli.py analyze    # librosa features -> data/features/ + features.parquet
conda run -n djset python cli.py sequence    # DJ ordering -> data/set_order.json + Spotify playlist
conda run -n djset python cli.py serve       # dashboard at http://127.0.0.1:8000 + auto-DJ
```

Use `--limit N` on `download`/`analyze` to test on a subset first.

For playback control you need **Spotify Premium** and the **desktop app open** (active device).

## How the ordering works

- **Key** — Spotify-free: we detect key from the audio (chroma) → Camelot code, and keep adjacent
  tracks harmonically compatible (same / relative / ±1 neighbour on the wheel).
- **Tempo** — BPM proximity with **half/double-time equivalence**, so a 75-BPM R&B track can sit
  next to a 150-BPM house track (the bridge club DJs use).
- **Energy arc** — a rising envelope + sine waves create multiple build-ups and drops across the
  session instead of a flat sort, for the dopamine peaks.
- Greedy nearest-neighbour path minimises a weighted "DJ distance" while following the arc.

## Apple Silicon (arm64) note

`librosa.beat.beat_track` and CQT chroma use numba-JIT code that **segfaults** on arm64 when two
OpenMP runtimes collide (the `openmp_*` OpenBLAS build + llvm-openmp, made worse by a pip-installed
numpy bundling its own OpenBLAS). Fixes baked in here:

1. Build the env with the **pthreads** OpenBLAS (`libopenblas=*=*pthreads*`) and a **stable numba
   0.61**, all from a single channel — never `pip install numpy` over it.
2. `analyze.py` uses `librosa.feature.tempo` instead of `beat_track`'s crashing DP step.

Refs: [llvm#61682](https://github.com/llvm/llvm-project/issues/61682),
[scipy#15050](https://github.com/scipy/scipy/issues/15050),
[anaconda-issues#13221](https://github.com/ContinuumIO/anaconda-issues/issues/13221).
