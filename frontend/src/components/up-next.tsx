"use client";

import { AnimatePresence, motion } from "motion/react";
import { Music2 } from "lucide-react";
import type { Track } from "@/lib/types";

// When the current track ends, the top of the queue leaves and the rest slide
// up. `layout` + AnimatePresence make that smooth instead of a hard jump.
export function UpNext({ tracks }: { tracks: Track[] }) {
  return (
    <div className="space-y-1">
      <AnimatePresence initial={false} mode="popLayout">
        {tracks.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">queue is empty</p>
        )}
        {tracks.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ type: "spring", stiffness: 450, damping: 38 }}
            className="flex items-center gap-3 rounded-md p-2"
          >
            {t.album_art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.album_art} alt="" className="size-10 shrink-0 rounded object-cover" />
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                <Music2 className="size-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{t.name}</div>
              <div className="truncate text-xs text-muted-foreground">{t.artists}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-sm font-semibold text-primary">{t.camelot}</span>
              <span className="text-xs text-muted-foreground">{t.bpm.toFixed(0)} BPM</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
