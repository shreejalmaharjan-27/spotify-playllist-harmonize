"use client";

import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const spring = { type: "spring", stiffness: 500, damping: 18 } as const;

function IconButton({
  onClick,
  label,
  primary,
  children,
}: {
  onClick: () => void;
  label: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.86 }}
      transition={spring}
      className={cn(
        "flex items-center justify-center rounded-full outline-none transition-colors",
        primary
          ? "size-12 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
          : "size-10 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </motion.button>
  );
}

export function Transport({ isPlaying }: { isPlaying?: boolean }) {
  async function ctl(action: "play" | "pause" | "skip" | "prev") {
    try {
      const r = await api.control(action);
      if (r.error) throw new Error(r.error);
    } catch (e) {
      toast.error("Playback control failed", { description: String(e) });
    }
  }

  return (
    <div className="flex items-center gap-1">
      <IconButton onClick={() => ctl("prev")} label="Previous">
        <SkipBack className="size-5" />
      </IconButton>
      <IconButton
        onClick={() => ctl(isPlaying ? "pause" : "play")}
        label={isPlaying ? "Pause" : "Play"}
        primary
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={isPlaying ? "pause" : "play"}
            initial={{ scale: 0, rotate: -90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, rotate: 90, opacity: 0 }}
            transition={spring}
          >
            {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
          </motion.span>
        </AnimatePresence>
      </IconButton>
      <IconButton onClick={() => ctl("skip")} label="Next">
        <SkipForward className="size-5" />
      </IconButton>
    </div>
  );
}
