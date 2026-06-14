"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

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
      <Button variant="ghost" size="icon" onClick={() => ctl("prev")} aria-label="Previous">
        <SkipBack className="size-5" />
      </Button>
      <Button
        size="icon"
        className="size-11 rounded-full"
        onClick={() => ctl(isPlaying ? "pause" : "play")}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
      </Button>
      <Button variant="ghost" size="icon" onClick={() => ctl("skip")} aria-label="Next">
        <SkipForward className="size-5" />
      </Button>
    </div>
  );
}
