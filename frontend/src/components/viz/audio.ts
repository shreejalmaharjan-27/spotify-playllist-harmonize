import type { NowPlaying } from "@/lib/types";

// Shared helpers for the custom Canvas2D visualizers. All read the same live
// AnalyserNode (real FFT of the playing track) plus the track metadata.

export interface VizProps {
  analyser: React.RefObject<AnalyserNode | null>;
  now: NowPlaying | null;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

/**
 * Read the frequency spectrum into `out` as N log-spaced bars (bass left →
 * treble right), normalized 0..1, with rise-fast / fall-slow smoothing.
 * `curve` controls the log skew, `span` the fraction of bins used (high bins
 * are usually empty). Returns `out`.
 */
export function readBars(
  freq: Uint8Array,
  out: Float32Array,
  curve = 1.7,
  span = 0.7,
): Float32Array {
  const bins = freq.length;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const lo = Math.floor(Math.pow(i / n, curve) * bins * span);
    const hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / n, curve) * bins * span));
    let m = 0;
    for (let b = lo; b < hi && b < bins; b++) if (freq[b] > m) m = freq[b];
    const target = m / 255;
    out[i] = target > out[i] ? target : out[i] * 0.86 + target * 0.14;
  }
  return out;
}

export interface Bands {
  bass: number;
  mid: number;
  treb: number;
  level: number;
}

/** Average energy (0..1) of low / mid / high bands + overall level. */
export function bands(freq: Uint8Array): Bands {
  const n = freq.length;
  const avg = (a: number, b: number) => {
    let s = 0;
    const lo = Math.floor(a * n);
    const hi = Math.floor(b * n);
    for (let i = lo; i < hi; i++) s += freq[i];
    return hi > lo ? s / (hi - lo) / 255 : 0;
  };
  const bass = avg(0, 0.06);
  const mid = avg(0.06, 0.25);
  const treb = avg(0.25, 0.6);
  return { bass, mid, treb, level: (bass + mid + treb) / 3 };
}

/** Beat phase 0..1 derived from playback position + BPM (no fragile onset detection). */
export function beatPhase(now: NowPlaying | null, baseRef?: { p: number; at: number; playing: boolean }): number {
  if (!now?.bpm) return 0;
  // interpolate the playback position locally for a smooth phase
  let posMs = now.progress_ms ?? 0;
  if (baseRef) {
    if (baseRef.at === 0) {
      baseRef.p = posMs;
      baseRef.at = performance.now();
      baseRef.playing = now.is_playing;
    }
    posMs = baseRef.playing ? baseRef.p + (performance.now() - baseRef.at) : baseRef.p;
  }
  const beats = (posMs / 1000) * (now.bpm / 60);
  return beats - Math.floor(beats);
}

/** A clock you resync only on track change / play-pause / big seek (smooth, no jitter). */
export function makeClock() {
  return { id: "", progress: 0, at: 0, playing: false, duration: 0 };
}
export function syncClock(c: ReturnType<typeof makeClock>, now: NowPlaying | null) {
  const server = now?.progress_ms ?? 0;
  const playing = now?.is_playing ?? false;
  const id = now?.id ?? "";
  const local = c.playing ? c.progress + (performance.now() - c.at) : c.progress;
  if (c.id !== id || c.playing !== playing || Math.abs(server - local) > 1200) {
    c.id = id;
    c.progress = server;
    c.at = performance.now();
    c.playing = playing;
    c.duration = now?.duration_ms ?? 0;
  } else {
    c.duration = now?.duration_ms ?? 0;
  }
}
export function clockPos(c: ReturnType<typeof makeClock>): number {
  return c.playing ? c.progress + (performance.now() - c.at) : c.progress;
}

// 256-entry inferno colormap as packed "r,g,b" strings (cheap to index).
// Sampled from the matplotlib inferno control points.
const INFERNO_STOPS: [number, number, number][] = [
  [0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99],
  [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164],
];
export function makeInferno(): Uint8Array {
  // returns a flat RGBA-ish [r,g,b] * 256 in a Uint8Array (3 per entry)
  const lut = new Uint8Array(256 * 3);
  const segs = INFERNO_STOPS.length - 1;
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * segs;
    const k = Math.min(segs - 1, Math.floor(t));
    const f = t - k;
    const a = INFERNO_STOPS[k];
    const b = INFERNO_STOPS[k + 1];
    lut[i * 3] = a[0] + (b[0] - a[0]) * f;
    lut[i * 3 + 1] = a[1] + (b[1] - a[1]) * f;
    lut[i * 3 + 2] = a[2] + (b[2] - a[2]) * f;
  }
  return lut;
}

/** Make a canvas's backing store match its CSS size at devicePixelRatio. Returns [cssW, cssH]. */
export function fitCanvas(canvas: HTMLCanvasElement): [number, number] {
  const cw = Math.max(1, canvas.clientWidth);
  const ch = Math.max(1, canvas.clientHeight);
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(cw * dpr);
  const ph = Math.round(ch * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  return [cw, ch];
}
