"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Music2, Play } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Track } from "@/lib/types";

const ROW = 56; // px per row

// The full remaining queue, virtualized: only the visible rows are rendered, so
// a several-hundred-song queue scrolls smoothly. Clicking a row jumps playback
// to that track and continues from there.
export function UpNext({ tracks }: { tracks: Track[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW,
    overscan: 10,
  });

  async function jump(t: Track) {
    try {
      const r = await api.playAt(t.pos);
      if (r.error) throw new Error(r.error);
      toast.success(`Jumping to ${t.name}`);
    } catch (e) {
      toast.error("Couldn't jump to track", { description: String(e) });
    }
  }

  if (tracks.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">queue is empty</p>;
  }

  return (
    <div ref={parentRef} className="h-[28rem] overflow-y-auto pr-2">
      <div style={{ height: v.getTotalSize(), position: "relative", width: "100%" }}>
        {v.getVirtualItems().map((vi) => {
          const t = tracks[vi.index];
          return (
            <button
              key={t.id}
              onClick={() => jump(t)}
              title={`Play "${t.name}" from here`}
              style={{ height: ROW, transform: `translateY(${vi.start}px)` }}
              className="group absolute left-0 top-0 flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/60"
            >
              <div className="relative size-10 shrink-0">
                {t.album_art ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.album_art} alt="" className="size-10 rounded object-cover" />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded bg-muted">
                    <Music2 className="size-4 text-muted-foreground" />
                  </div>
                )}
                <span className="absolute inset-0 flex items-center justify-center rounded bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
                  <Play className="size-4 fill-white text-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{t.name}</div>
                <div className="truncate text-xs text-muted-foreground">{t.artists}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="text-sm font-semibold text-primary">{t.camelot}</span>
                <span className="text-xs text-muted-foreground">{t.bpm.toFixed(0)} BPM</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
