"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { NowPlaying, Track } from "@/lib/types";

// DJ-style dual waveform: the OUTRO of the current track butted up against the
// INTRO of the next, so you can eyeball whether the seam blends.
function Bars({ peaks, cls, fade }: { peaks: number[]; cls: string; fade: "in" | "out" }) {
  if (!peaks.length) {
    return <div className="h-16 flex-1 rounded bg-muted/15" />;
  }
  const max = Math.max(...peaks) || 1;
  const n = peaks.length;
  const bw = 100 / n;
  return (
    <svg viewBox="0 0 100 64" preserveAspectRatio="none" className="h-16 flex-1">
      {peaks.map((p, i) => {
        const h = Math.max(1.5, (p / max) * 60);
        // fade toward the seam (outro fades on its right edge, intro on its left)
        const t = i / (n - 1 || 1);
        const opacity = fade === "out" ? 0.35 + 0.65 * (1 - t) : 0.35 + 0.65 * t;
        return (
          <rect
            key={i}
            x={i * bw}
            y={(64 - h) / 2}
            width={Math.max(0.4, bw - 0.3)}
            height={h}
            rx={0.5}
            className={cls}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

export function TransitionView({ now, next }: { now: NowPlaying | null; next: Track | null }) {
  const [nextWave, setNextWave] = useState<number[]>([]);

  useEffect(() => {
    if (!next) {
      setNextWave([]);
      return;
    }
    let alive = true;
    api
      .curves(next.id)
      .then((c) => alive && setNextWave(c.waveform ?? []))
      .catch(() => alive && setNextWave([]));
    return () => {
      alive = false;
    };
  }, [next?.id]);

  if (!next) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        nothing queued — pick a playlist
      </p>
    );
  }

  const cur = now?.curves?.waveform ?? [];
  const SLICE = 0.3; // show the last/first ~30% of each track
  const outro = cur.slice(Math.floor(cur.length * (1 - SLICE)));
  const intro = nextWave.slice(0, Math.ceil(nextWave.length * SLICE));

  return (
    <div>
      <div className="flex items-stretch">
        <Bars peaks={outro} cls="fill-muted-foreground" fade="out" />
        <div className="mx-0.5 w-0.5 shrink-0 rounded bg-primary" />
        <Bars peaks={intro} cls="fill-primary" fade="in" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">
          {now?.name ?? "—"} {now?.camelot ? `· ${now.camelot}` : ""}
        </span>
        <ArrowRight className="size-3 shrink-0 text-primary" />
        <span className="min-w-0 truncate text-right text-foreground">
          {next.name} · {next.camelot} · {next.bpm.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
