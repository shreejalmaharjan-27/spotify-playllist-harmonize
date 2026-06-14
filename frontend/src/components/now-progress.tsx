"use client";

import { useEffect, useRef, useState } from "react";
import { ms as fmt } from "@/lib/format";
import type { NowPlaying } from "@/lib/types";

// The server only sends progress once a second; advancing the bar in 1s steps
// looks jerky. We interpolate locally with rAF and resync to the server value
// whenever a fresh frame arrives. Isolated here so only the bar re-renders at
// 60fps, not the whole page.
export function NowProgress({ now }: { now: NowPlaying }) {
  const base = useRef({ progress: 0, at: 0, playing: false, duration: 0 });
  const [pms, setPms] = useState(now.progress_ms);

  useEffect(() => {
    base.current = {
      progress: now.progress_ms,
      at: performance.now(),
      playing: now.is_playing,
      duration: now.duration_ms,
    };
  }, [now.id, now.progress_ms, now.is_playing, now.duration_ms]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const b = base.current;
      const cur = b.playing ? b.progress + (performance.now() - b.at) : b.progress;
      setPms(b.duration ? Math.min(cur, b.duration) : cur);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const frac = now.duration_ms ? pms / now.duration_ms : 0;
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(frac * 100, 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
        <span>{fmt(pms)}</span>
        <span>{fmt(now.duration_ms)}</span>
      </div>
    </div>
  );
}
