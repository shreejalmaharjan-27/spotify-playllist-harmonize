"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ListMusic, Music2, Radio, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CamelotWheel } from "@/components/camelot-wheel";
import { EnergyArc } from "@/components/energy-arc";
import { NowProgress } from "@/components/now-progress";
import { PlaylistPicker } from "@/components/playlist-picker";
import { Transport } from "@/components/transport";
import { UpNext } from "@/components/up-next";
import { Visualizer } from "@/components/visualizer";
import { WaveDeck } from "@/components/wave-deck";
import { useLive } from "@/lib/useSocket";
import { useVisualizer } from "@/lib/visualizer-context";

export default function NowPlayingPage() {
  const { now: nowMsg, set } = useLive();
  const now = nowMsg?.now ?? null;
  const pos = nowMsg?.pos ?? null;
  const upnext = set ? set.tracks.slice((pos ?? -1) + 1) : [];
  const notAuthed = nowMsg?.error === "not_authenticated";
  const { vizMode, toggleVizMode } = useVisualizer();

  // Keyboard shortcut: V toggles visualizer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "v" || e.key === "V") {
        // Don't toggle if typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        toggleVizMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleVizMode]);

  if (notAuthed) return <ConnectPrompt />;

  // ── Visualizer mode ──────────────────────────────────
  if (vizMode) {
    return (
      <div className="flex h-full flex-col">
        {/* Canvas area */}
        <div className="relative flex-1">
          <Visualizer now={now} />
          {!now && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center">
                <Radio className="size-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Nothing playing</p>
                <p className="text-xs text-muted-foreground/60">press V to exit visualizer</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex shrink-0 items-center gap-4 border-t border-border bg-card/60 px-5 py-2.5 backdrop-blur">
          {/* Track info (left) */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {now?.album_art ? (
              <img
                src={now.album_art}
                alt=""
                className="size-10 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                <Music2 className="size-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {now?.name ?? "No track"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {now?.artists ?? "—"}
                {now?.camelot ? ` · ${now.camelot}` : ""}
              </p>
            </div>
          </div>

          {/* Transport (center) */}
          <div className="shrink-0">
            <Transport isPlaying={now?.is_playing} />
          </div>

          {/* Exit button (right) */}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <span className="hidden text-xs text-muted-foreground/50 sm:inline">V to exit</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleVizMode}
              title="Exit visualizer (V)"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal mode ──────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Now Playing</h1>
          {set && (
            <p className="text-sm text-muted-foreground">
              {set.count} tracks · {set.compatible_pct}% key-compatible
              {set.missing ? ` · ${set.missing} not analyzed` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleVizMode}
            title="Visualizer mode (V)"
          >
            <Sparkles className="size-4" />
            <span className="ml-1.5 hidden sm:inline">Visualizer</span>
          </Button>
          <PlaylistPicker
            trigger={
              <Button variant="secondary">
                <ListMusic className="size-4" /> Choose playlist
              </Button>
            }
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* left: now playing + viz */}
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            {now ? (
              <div className="flex gap-5">
                <div className="relative size-32 shrink-0 overflow-hidden rounded-lg bg-muted shadow-lg">
                  <AnimatePresence>
                    {now.album_art ? (
                      <motion.img
                        key={now.id}
                        src={now.album_art}
                        alt=""
                        initial={{ opacity: 0, scale: 1.08 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.45, ease: "easeOut" }}
                        className="absolute inset-0 size-32 object-cover"
                      />
                    ) : (
                      <div className="flex size-32 items-center justify-center">
                        <Music2 className="size-8 text-muted-foreground" />
                      </div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={now.id}
                      className="min-w-0"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                      <h2 className="truncate text-2xl font-bold">{now.name}</h2>
                      <p className="truncate text-muted-foreground">{now.artists}</p>
                    </motion.div>
                  </AnimatePresence>
                  <motion.div
                    key={`badges-${now.id}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 }}
                    className="mt-3 flex flex-wrap gap-2"
                  >
                    {now.camelot ? (
                      <>
                        <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                          {now.camelot}
                        </Badge>
                        <Badge variant="secondary">{now.bpm?.toFixed(0)} BPM</Badge>
                        <Badge variant="secondary">{now.key_name}</Badge>
                        <Badge variant="secondary">energy {now.energy?.toFixed(2)}</Badge>
                      </>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        not analyzed — see Library
                      </Badge>
                    )}
                  </motion.div>
                  {now.transition && now.transition !== "intro" && (
                    <p className="mt-2 text-sm text-primary">↳ {now.transition}</p>
                  )}
                  <div className="mt-auto pt-4">
                    <NowProgress now={now} />
                  </div>
                </div>
                <div className="flex items-center">
                  <Transport isPlaying={now.is_playing} />
                </div>
              </div>
            ) : (
              <EmptyNow />
            )}
          </Card>

          <Card className="p-5">
            <div className="mt-3">
              <WaveDeck now={now} tracks={set?.tracks ?? []} pos={pos} />
            </div>
          </Card>

          <Card className="p-5">
            <CardLabel>
              set energy arc{pos != null && set ? ` · track ${pos + 1}/${set.count}` : ""}
            </CardLabel>
            <div className="mt-2 h-40">
              {set ? (
                <EnergyArc target={set.target_curve} actual={set.actual_curve} pos={pos} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  pick a playlist to see the energy arc
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* right: camelot wheel + up next */}
        <div className="space-y-5">
          <Card className="flex flex-col items-center gap-1 p-5">
            <CardLabel>harmonic wheel</CardLabel>
            <CamelotWheel code={now?.camelot} />
            <p className="text-xs text-muted-foreground">
              {now?.camelot ? "green = mixable next keys" : "—"}
            </p>
          </Card>

          <Card className="p-5">
            <CardLabel>up next{upnext.length ? ` · ${upnext.length}` : ""}</CardLabel>
            <div className="mt-3">
              <UpNext tracks={upnext} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function EmptyNow() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <Radio className="size-8 text-muted-foreground" />
      <div>
        <p className="font-medium">Nothing playing</p>
        <p className="text-sm text-muted-foreground">
          Choose a playlist and make sure the Spotify desktop app is open.
        </p>
      </div>
      <PlaylistPicker />
    </div>
  );
}

function ConnectPrompt() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-md p-8 text-center">
        <Radio className="mx-auto size-8 text-primary" />
        <h2 className="mt-3 text-lg font-semibold">Connect Spotify</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Log in with Spotify Premium to read your playlists and control playback.
        </p>
        <Link href="/settings" className={buttonVariants({ className: "mt-4" })}>
          Go to Settings →
        </Link>
      </Card>
    </div>
  );
}
