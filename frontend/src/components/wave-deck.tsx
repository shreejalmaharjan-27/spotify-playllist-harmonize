"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { NowPlaying, Track } from "@/lib/types";

const THRESHOLD = 40; // seconds remaining before the next track starts filling in
const H = 88; // strip height px

function Bars({ peaks, cls }: { peaks: number[]; cls: string }) {
  if (!peaks.length) return null;
  const max = Math.max(...peaks) || 1;
  const n = peaks.length;
  const bw = 100 / n;
  return (
    <svg
      viewBox={`0 0 100 ${H}`}
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
    >
      {peaks.map((p, i) => {
        const h = Math.max(1.5, (p / max) * (H - 6));
        return (
          <rect
            key={i}
            x={i * bw}
            y={(H - h) / 2}
            width={Math.max(0.4, bw - 0.3)}
            height={h}
            rx={0.5}
            className={cls}
          />
        );
      })}
    </svg>
  );
}

// A single waveform strip with a playhead wipe. Right of the playhead = the
// current song's remaining audio. Left of the playhead = played-current
// normally, but in the final stretch it crossfades to the NEXT track's
// waveform, which builds up in the (now-spent) played space as the song winds
// down. Everything is clip/opacity driven by rAF — 60fps, no React re-renders.
export function WaveDeck({ now, next }: { now: NowPlaying | null; next: Track | null }) {
  const [waves, setWaves] = useState<Record<string, number[]>>({});
  const [countdown, setCountdown] = useState<number | null>(null);
  const playedRef = useRef<HTMLDivElement>(null); // played-current accent
  const nextRef = useRef<HTMLDivElement>(null); // next track, filling played space
  const headRef = useRef<HTMLDivElement>(null); // playhead line
  const base = useRef({ progress: 0, at: 0, playing: false, duration: 0 });

  useEffect(() => {
    const wf = now?.curves?.waveform;
    if (now?.id && wf?.length) setWaves((w) => (w[now.id] ? w : { ...w, [now.id]: wf }));
  }, [now?.id, now?.curves?.waveform]);

  useEffect(() => {
    if (next?.id && !waves[next.id]) {
      api
        .curves(next.id)
        .then((c) => setWaves((w) => ({ ...w, [next.id]: c.waveform ?? [] })))
        .catch(() => {});
    }
  }, [next?.id, waves]);

  useEffect(() => {
    base.current = {
      progress: now?.progress_ms ?? 0,
      at: performance.now(),
      playing: now?.is_playing ?? false,
      duration: now?.duration_ms ?? 0,
    };
  }, [now?.id, now?.progress_ms, now?.is_playing, now?.duration_ms]);

  const hasNext = !!next?.id;
  useEffect(() => {
    let raf = 0;
    let lastCd = -2;
    const tick = () => {
      const b = base.current;
      const cur = b.playing ? b.progress + (performance.now() - b.at) : b.progress;
      const frac = b.duration ? Math.min(Math.max(cur / b.duration, 0), 1) : 0;
      const remaining = b.duration ? Math.max(0, (b.duration - cur) / 1000) : Infinity;
      const handoff = hasNext && remaining <= THRESHOLD;
      const playedClip = `inset(0 ${(1 - frac) * 100}% 0 0)`; // reveal left of playhead

      if (playedRef.current) {
        playedRef.current.style.clipPath = playedClip;
        playedRef.current.style.opacity = handoff ? "0" : "1";
      }
      if (nextRef.current) {
        nextRef.current.style.clipPath = playedClip;
        nextRef.current.style.opacity = handoff ? "1" : "0";
      }
      if (headRef.current) headRef.current.style.left = `${frac * 100}%`;

      const cd = handoff ? Math.ceil(remaining) : -1;
      if (cd !== lastCd) {
        lastCd = cd;
        setCountdown(cd >= 0 ? cd : null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasNext]);

  if (!now) return <div className="rounded-md bg-muted/20" style={{ height: H }} />;

  const curPeaks = waves[now.id] ?? now.curves?.waveform ?? [];
  const nextPeaks = next ? (waves[next.id] ?? []) : [];

  return (
    <div>
      <div className="relative overflow-hidden rounded" style={{ height: H }}>
        {/* base: the full current waveform, muted */}
        <Bars peaks={curPeaks} cls="fill-muted-foreground/30" />
        {/* played-current accent (normal playback) */}
        <div
          ref={playedRef}
          className="absolute inset-0 transition-opacity duration-500"
          style={{ clipPath: "inset(0 100% 0 0)" }}
        >
          <Bars peaks={curPeaks} cls="fill-primary" />
        </div>
        {/* next track building up in the played space during the handoff */}
        <div
          ref={nextRef}
          className="absolute inset-0 opacity-0 transition-opacity duration-500"
          style={{ clipPath: "inset(0 100% 0 0)" }}
        >
          <Bars peaks={nextPeaks} cls="fill-primary" />
        </div>
        {/* playhead */}
        <div
          ref={headRef}
          className="absolute top-0 h-full w-px -translate-x-1/2 bg-foreground/70"
          style={{ left: "0%" }}
        />
      </div>
      {next && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate text-muted-foreground">
            {now.name}
            {now.camelot ? ` · ${now.camelot}` : ""}
          </span>
          <span className="shrink-0 font-medium text-primary">
            {countdown != null ? `${countdown}s → next` : "→ next"}
          </span>
          <span className="min-w-0 truncate text-right text-foreground">
            {next.name} · {next.camelot} · {next.bpm.toFixed(0)}
          </span>
        </div>
      )}
    </div>
  );
}
