"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { NowPlaying, Track } from "@/lib/types";

const H = 88; // strip height px
const VISIBLE_BARS = 220; // zoom for the scrolling transition view (higher = more bars shown)
const PH = 0.3; // playhead position in scroll mode (fraction from the left)
const TRANSITION_AT = 30; // seconds remaining when we switch to the scrolling view

type Seg = { id: string; peaks: number[]; future: boolean; offset: number };

// Two modes:
//  • Overview (normal playback): the whole current song fit to width, static,
//    with a playhead sweeping across (no scrolling).
//  • Transition (last 30s, when a next song exists): a zoomed-in strip of the
//    current tail + next intro scrolling under a fixed playhead.
// The two crossfade at the 30s mark. All motion is rAF (no per-frame re-render).
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
  const [durs, setDurs] = useState<Record<string, number>>({});
  const [countdown, setCountdown] = useState<number | null>(null);
  const [transition, setTransition] = useState(false);
  const [w, setW] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const ovPlayedRef = useRef<HTMLDivElement>(null);
  const ovHeadRef = useRef<HTMLDivElement>(null);
  const scBaseRef = useRef<HTMLDivElement>(null);
  const scPlayedRef = useRef<HTMLDivElement>(null);
  const clock = useRef({ id: "", progress: 0, at: 0, playing: false, duration: 0 });
  const transRef = useRef(false);
  const fetchedRef = useRef<Set<string>>(new Set());

  const inSet = pos != null && tracks[pos]?.id === now?.id;
  const nextTrack = inSet && pos != null ? tracks[pos + 1] : undefined;

  useEffect(() => {
    const wf = now?.curves?.waveform;
    if (now?.id && wf?.length) {
      setWaves((m) => (m[now.id] ? m : { ...m, [now.id]: wf }));
      setDurs((m) => ({ ...m, [now.id]: (now.duration_ms ?? 0) / 1000 }));
    }
  }, [now?.id, now?.curves?.waveform, now?.duration_ms]);

  useEffect(() => {
    const nid = nextTrack?.id;
    if (nid && !fetchedRef.current.has(nid)) {
      fetchedRef.current.add(nid);
      api
        .curves(nid)
        .then((c) => {
          setWaves((m) => ({ ...m, [nid]: c.waveform ?? [] }));
          setDurs((m) => ({ ...m, [nid]: c.duration_sec }));
        })
        .catch(() => {
          fetchedRef.current.delete(nid); // allow retry on next render
        });
    }
  }, [nextTrack?.id]);

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

  const curPeaks = waves[now?.id ?? ""] ?? now?.curves?.waveform ?? [];
  const curLen = curPeaks.length;
  const hasNext = !!nextTrack?.id;

  // scroll-mode geometry: current + next intro
  const scroll = useMemo(() => {
    const segs: Seg[] = [];
    if (now?.id) segs.push({ id: now.id, peaks: curPeaks, future: false, offset: 0 });
    if (nextTrack?.id) {
      // append the full next waveform so the scrolling view never runs out of
      // bars / shows dead space — you see as much of the next song as fits.
      const full = waves[nextTrack.id] ?? [];
      if (full.length) segs.push({ id: nextTrack.id, peaks: full, future: true, offset: curLen });
    }
    return { segs, total: segs.reduce((a, s) => a + s.peaks.length, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now?.id, nextTrack?.id, curLen, waves]);

  const scBarPx = w ? w / VISIBLE_BARS : 0;

  useEffect(() => {
    let raf = 0;
    let lastCd = -2;
    const tick = () => {
      const c = clock.current;
      const cur = c.playing ? c.progress + (performance.now() - c.at) : c.progress;
      const frac = c.duration ? Math.min(Math.max(cur / c.duration, 0), 1) : 0;
      const remaining = c.duration ? Math.max(0, (c.duration - cur) / 1000) : Infinity;

      const trans = hasNext && remaining <= TRANSITION_AT;
      if (trans !== transRef.current) {
        transRef.current = trans;
        setTransition(trans);
      }

      // overview: moving playhead via clip + line
      if (ovPlayedRef.current) ovPlayedRef.current.style.clipPath = `inset(0 ${(1 - frac) * 100}% 0 0)`;
      if (ovHeadRef.current) ovHeadRef.current.style.left = `${frac * 100}%`;
      // scroll: strip translate under a fixed playhead
      if (scBarPx) {
        const tx = `translateX(${PH * w - frac * curLen * scBarPx}px)`;
        if (scBaseRef.current) scBaseRef.current.style.transform = tx;
        if (scPlayedRef.current) scPlayedRef.current.style.transform = tx;
      }

      const cd = trans ? Math.ceil(remaining) : -1;
      if (cd !== lastCd) {
        lastCd = cd;
        setCountdown(cd >= 0 ? cd : null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasNext, scBarPx, curLen, w]);

  const bars = (segs: Seg[], accent: boolean) =>
    segs.map((seg) => {
      if (!seg.peaks.length) return null;
      const max = Math.max(...seg.peaks, 0.0001);
      const baseCls = seg.future ? "fill-primary/30" : "fill-muted-foreground/45";
      return (
        <g key={seg.id}>
          {seg.peaks.map((p, j) => {
            const h = Math.max(1.5, (p / max) * (H - 6));
            return (
              <rect key={j} x={seg.offset + j + 0.15} y={(H - h) / 2} width={0.7} height={h} rx={0.25}
                className={accent ? "fill-primary" : baseCls} />
            );
          })}
          {!accent && seg.offset > 0 && (
            <rect x={seg.offset - 0.06} y={0} width={0.12} height={H} className="fill-primary/70" />
          )}
        </g>
      );
    });

  const ovSeg: Seg[] = now?.id ? [{ id: now.id, peaks: curPeaks, future: false, offset: 0 }] : [];

  return (
    <div>
      <div ref={containerRef} className="relative overflow-hidden rounded" style={{ height: H }}>
        {/* OVERVIEW (whole song, static, moving playhead) */}
        <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: transition ? 0 : 1 }}>
          {curLen > 0 && (
            <>
              <svg width="100%" height={H} viewBox={`0 0 ${curLen} ${H}`} preserveAspectRatio="none" className="absolute inset-0">
                {bars(ovSeg, false)}
              </svg>
              <div ref={ovPlayedRef} className="absolute inset-0" style={{ clipPath: "inset(0 100% 0 0)" }}>
                <svg width="100%" height={H} viewBox={`0 0 ${curLen} ${H}`} preserveAspectRatio="none" className="absolute inset-0">
                  {bars(ovSeg, true)}
                </svg>
              </div>
              <div ref={ovHeadRef} className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-foreground" style={{ left: "0%" }} />
            </>
          )}
        </div>

        {/* TRANSITION (scrolling current tail -> next intro, fixed playhead) */}
        {hasNext && (
          <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: transition ? 1 : 0 }}>
            <div ref={scBaseRef} className="absolute left-0 top-0 h-full will-change-transform" style={{ width: scroll.total * scBarPx }}>
              {scBarPx > 0 && (
                <svg width={scroll.total * scBarPx} height={H} viewBox={`0 0 ${scroll.total || 1} ${H}`} preserveAspectRatio="none">
                  {bars(scroll.segs, false)}
                </svg>
              )}
            </div>
            <div className="pointer-events-none absolute inset-0" style={{ clipPath: `inset(0 ${(1 - PH) * 100}% 0 0)` }}>
              <div ref={scPlayedRef} className="absolute left-0 top-0 h-full will-change-transform" style={{ width: scroll.total * scBarPx }}>
                {scBarPx > 0 && (
                  <svg width={scroll.total * scBarPx} height={H} viewBox={`0 0 ${scroll.total || 1} ${H}`} preserveAspectRatio="none">
                    {bars(scroll.segs, true)}
                  </svg>
                )}
              </div>
            </div>
            <div className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${PH * 100}%` }} />
          </div>
        )}

        {!now && (
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
