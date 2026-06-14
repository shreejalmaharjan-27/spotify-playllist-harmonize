"use client";

import { useEffect, useState } from "react";
import { Heart, ListMusic, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { api } from "@/lib/api";
import type { Playlist } from "@/lib/types";

export function PlaylistPicker({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    if (!open || playlists) return;
    setLoading(true);
    api
      .playlists()
      .then((d) => setPlaylists(d.playlists))
      .catch((e) => toast.error("Couldn't load playlists", { description: String(e) }))
      .finally(() => setLoading(false));
  }, [open, playlists]);

  async function pick(p: Playlist) {
    setSelecting(p.id);
    try {
      const r = await api.selectPlaylist(p.id);
      if (r.error) throw new Error(r.error);
      toast.success(`DJing "${p.name}"`, {
        description: `${r.ordered} ordered · ${r.compatible_pct}% key-compatible${
          r.missing ? ` · ${r.missing} not analyzed` : ""
        }`,
      });
      setOpen(false);
    } catch (e) {
      toast.error("Couldn't start playlist", { description: String(e) });
    } finally {
      setSelecting(null);
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>
        {trigger ?? (
          <Button>
            <ListMusic className="size-4" /> Choose playlist
          </Button>
        )}
      </span>
      <CommandDialog open={open} onOpenChange={setOpen} title="Choose a playlist">
        <CommandInput placeholder="Search your playlists…" />
        <CommandList>
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> loading playlists…
            </div>
          )}
          <CommandEmpty>No playlists found.</CommandEmpty>
          {playlists && (
            <CommandGroup heading="Your library" className="space-y-1 p-2">
              {playlists.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name + p.id}
                  onSelect={() => pick(p)}
                  className="gap-3 rounded-lg px-2 py-2.5 data-[selected=true]:bg-accent"
                >
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="size-9 rounded object-cover" />
                  ) : (
                    <div className="flex size-9 items-center justify-center rounded bg-primary/15">
                      <Heart className="size-4 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.count} tracks · {p.owner}
                    </div>
                  </div>
                  {selecting === p.id && <Loader2 className="size-4 animate-spin" />}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
