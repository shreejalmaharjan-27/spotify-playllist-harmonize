"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { NowPlaying, Track } from "@/lib/types";

const H = 88; // strip height px
const VISIBLE_BARS = 110; // zoom: how many bars span the container width
const PH = 0.3; // playhead position (fraction from the left)
const BEFORE = 1; // queue tracks to keep behind the current one
const AFTER = 3; // queue tracks to keep ahead

// A continuous, constant-scale waveform timeline. A window of consecutive queue
// tracks is laid end-to-end as one strip and scrolled left under a fixed
// playhead. Because the timeline spans several tracks, advancing to the next
// song doesn't rebuild it — the scroll just continues across the seam. Left of
// the playhead is played (bright accent); upcoming current is grey, upcoming
// next tracks are tinted. Scroll is one rAF transform per frame.
export function WaveDeck({
  now,
  tracks,
  pos,
}: {
  now: NowPlaying | null;
  tracks: Track[];
  pos: number | null;
}) {
  const [waves, setWaves] = useState<Record<string, number[]>>({});
  const [countdown, setCountdown] = useState<number | null>(null);
  const [w, setW] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const playedRef = useRef<HTMLDivElement>(null);
  const clock = useRef({ id: "", progress: 0, at: 0, playing: false, duration: 0 });

  // the window of tracks shown in the timeline
  const inSet = pos != null && tracks[pos]?.id === now?.id;
  const start = inSet ? Math.max(0, (pos as number) - BEFORE) : 0;
  const windowTracks = useMemo<{ id: string; future: boolean }[]>(() => {
    if (inSet) {
      return tracks
        .slice(start, (pos as number) + 1 + AFTER)
        .map((t, i) => ({ id: t.id, future: start + i > (pos as number) }));
    }
    return now ? [{ id: now.id, future: false }] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSet, start, pos, now?.id, tracks]);
  const curIdx = inSet ? (pos as number) - start : 0;
  const winKey = windowTracks.map((t) => t.id).join(",");

  // cache current waveform from the now payload
  useEffect(() => {
    const wf = now?.curves?.waveform;
    if (now?.id && wf?.length) setWaves((m) => (m[now.id] ? m : { ...m, [now.id]: wf }));
  }, [now?.id, now?.curves?.waveform]);

  // fetch every window track's waveform
  useEffect(() => {
    windowTracks.forEach((t) => {
      if (t.id && !waves[t.id]) {
        api
          .curves(t.id)
          .then((c) => setWaves((m) => ({ ...m, [t.id]: c.waveform ?? [] })))
          .catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winKey, waves]);

  // drift-tolerant clock: only resync on track change / play-pause / big seek,
  // so it doesn't micro-jump on each 1s server tick.
  useEffect(() => {
    const c = clock.current;
    const server = now?.progress_ms ?? 0;
    const playing = now?.is_playing ?? false;
    const id = now?.id ?? "";
    const local = c.playing ? c.progress + (performance.now() - c.at) : c.progress;
    if (c.id !== id || c.playing !== playing || Math.abs(server - local) > 1200) {
      clock.current = { id, progress: server, at: performance.now(), playing, duration: now?.duration_ms ?? 0 };
    } else {
      clock.current.duration = now?.duration_ms ?? 0;
    }
  }, [now?.id, now?.progress_ms, now?.is_playing, now?.duration_ms]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // build the bar geometry for the whole window (once per data/size change)
  const geom = useMemo(() => {
    let offset = 0;
    const segments = windowTracks.map((t) => {
      const peaks = waves[t.id] ?? [];
      const seg = { id: t.id, future: t.future, peaks, offset, len: peaks.length };
      offset += peaks.length;
      return seg;
    });
    return { segments, total: offset };
  }, [winKey, waves]);

  const barPx = w ? w / VISIBLE_BARS : 0;
  const curLen = geom.segments[curIdx]?.len ?? 0;
  const curOffset = geom.segments[curIdx]?.offset ?? 0;

  useEffect(() => {
    let raf = 0;
    let lastCd = -2;
    const tick = () => {
      const c = clock.current;
      const cur = c.playing ? c.progress + (performance.now() - c.at) : c.progress;
      const frac = c.duration ? Math.min(Math.max(cur / c.duration, 0), 1) : 0;
      const remaining = c.duration ? Math.max(0, (c.duration - cur) / 1000) : Infinity;
      if (barPx) {
        const headBar = curOffset + frac * curLen;
        const tx = `translateX(${PH * w - headBar * barPx}px)`;
        if (baseRef.current) baseRef.current.style.transform = tx;
        if (playedRef.current) playedRef.current.style.transform = tx;
      }
      const hasNext = curIdx + 1 < geom.segments.length;
      const cd = hasNext && remaining <= 40 ? Math.ceil(remaining) : -1;
      if (cd !== lastCd) {
        lastCd = cd;
        setCountdown(cd >= 0 ? cd : null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [barPx, curOffset, curLen, curIdx, w, geom.segments.length]);

  const stripStyle = { width: geom.total * barPx } as const;
  const renderBars = (accent: boolean) =>
    geom.segments.map((seg) => {
      if (!seg.len) return null;
      const max = Math.max(...seg.peaks, 0.0001);
      const baseCls = seg.future ? "fill-primary/30" : "fill-muted-foreground/45";
      return (
        <g key={seg.id}>
          {seg.peaks.map((p, j) => {
            const h = Math.max(1.5, (p / max) * (H - 6));
            return (
              <rect
                key={j}
                x={seg.offset + j + 0.15}
                y={(H - h) / 2}
                width={0.7}
                height={h}
                rx={0.25}
                className={accent ? "fill-primary" : baseCls}
              />
            );
          })}
          {!accent && seg.offset > 0 && (
            <rect x={seg.offset - 0.06} y={0} width={0.12} height={H} className="fill-primary/70" />
          )}
        </g>
      );
    });

  const nextTrack = inSet && pos != null ? tracks[pos + 1] : undefined;

  return (
    <div>
      <div ref={containerRef} className="relative overflow-hidden rounded" style={{ height: H }}>
        <div ref={baseRef} className="absolute left-0 top-0 h-full will-change-transform" style={stripStyle}>
          {barPx > 0 && (
            <svg width={geom.total * barPx} height={H} viewBox={`0 0 ${geom.total || 1} ${H}`} preserveAspectRatio="none">
              {renderBars(false)}
            </svg>
          )}
        </div>
        <div className="pointer-events-none absolute inset-0" style={{ clipPath: `inset(0 ${(1 - PH) * 100}% 0 0)` }}>
          <div ref={playedRef} className="absolute left-0 top-0 h-full will-change-transform" style={stripStyle}>
            {barPx > 0 && (
              <svg width={geom.total * barPx} height={H} viewBox={`0 0 ${geom.total || 1} ${H}`} preserveAspectRatio="none">
                {renderBars(true)}
              </svg>
            )}
          </div>
        </div>
        {now ? (
          <div className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${PH * 100}%` }} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            nothing playing
          </div>
        )}
      </div>
      {now && nextTrack && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate text-muted-foreground">
            {now.name}
            {now.camelot ? ` · ${now.camelot}` : ""}
          </span>
          <span className="shrink-0 font-medium text-primary">
            {countdown != null ? `${countdown}s → next` : "→ next"}
          </span>
          <span className="min-w-0 truncate text-right text-foreground">
            {nextTrack.name} · {nextTrack.camelot} · {nextTrack.bpm.toFixed(0)}
          </span>
        </div>
      )}
    </div>
  );
}
