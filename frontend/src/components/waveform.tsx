"use client";

import { useEffect, useMemo, useRef } from "react";
import type { NowPlaying } from "@/lib/types";

// Clean bar waveform with a smooth playhead. The bars are rendered ONCE (muted
// base + accent overlay); only the overlay's clip-path is updated per frame via
// rAF, so the playhead glides at 60fps without re-rendering 400 SVG bars or the
// React tree. We interpolate progress locally and resync to the server tick.
export function Waveform({
  peaks,
  now,
  height = 96,
}: {
  peaks: number[];
  now: NowPlaying | null;
  height?: number;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const base = useRef({ progress: 0, at: 0, playing: false, duration: 0 });

  useEffect(() => {
    base.current = {
      progress: now?.progress_ms ?? 0,
      at: performance.now(),
      playing: now?.is_playing ?? false,
      duration: now?.duration_ms ?? 0,
    };
  }, [now?.id, now?.progress_ms, now?.is_playing, now?.duration_ms]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const b = base.current;
      const cur = b.playing ? b.progress + (performance.now() - b.at) : b.progress;
      const frac = b.duration ? Math.min(Math.max(cur / b.duration, 0), 1) : 0;
      if (overlayRef.current) {
        overlayRef.current.style.clipPath = `inset(0 ${(1 - frac) * 100}% 0 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const bars = useMemo(() => {
    if (!peaks.length) return null;
    const max = Math.max(...peaks) || 1;
    const n = peaks.length;
    const barW = 100 / n;
    return peaks.map((p, i) => {
      const h = Math.max(1.5, (p / max) * (height - 4));
      return { x: i * barW, y: (height - h) / 2, w: Math.max(0.4, barW - 1 / n), h };
    });
  }, [peaks, height]);

  if (!bars) return <div className="w-full rounded-md bg-muted/30" style={{ height }} />;

  const svg = (cls: string) => (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0"
    >
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={0.6} className={cls} />
      ))}
    </svg>
  );

  return (
    <div className="relative w-full" style={{ height }}>
      {svg("fill-muted-foreground/35")}
      <div ref={overlayRef} className="absolute inset-0" style={{ clipPath: "inset(0 100% 0 0)" }}>
        {svg("fill-primary")}
      </div>
    </div>
  );
}
