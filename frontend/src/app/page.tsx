"use client";

import Link from "next/link";
import { ListMusic, Music2, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CamelotWheel } from "@/components/camelot-wheel";
import { EnergyArc } from "@/components/energy-arc";
import { PlaylistPicker } from "@/components/playlist-picker";
import { Transport } from "@/components/transport";
import { Waveform } from "@/components/waveform";
import { ms } from "@/lib/format";
import { useLive } from "@/lib/useSocket";

export default function NowPlayingPage() {
  const { now: nowMsg, set } = useLive();
  const now = nowMsg?.now ?? null;
  const upnext = nowMsg?.upnext ?? [];
  const pos = nowMsg?.pos ?? null;
  const notAuthed = nowMsg?.error === "not_authenticated";
  const progress = now?.duration_ms ? now.progress_ms / now.duration_ms : 0;

  if (notAuthed) return <ConnectPrompt />;

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
        <PlaylistPicker
          trigger={
            <Button variant="secondary">
              <ListMusic className="size-4" /> Choose playlist
            </Button>
          }
        />
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* left: now playing + viz */}
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            {now ? (
              <div className="flex gap-5">
                {now.album_art ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={now.album_art}
                    alt=""
                    className="size-32 rounded-lg object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex size-32 items-center justify-center rounded-lg bg-muted">
                    <Music2 className="size-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-bold">{now.name}</h2>
                    <p className="truncate text-muted-foreground">{now.artists}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
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
                  </div>
                  {now.transition && now.transition !== "intro" && (
                    <p className="mt-2 text-sm text-primary">↳ {now.transition}</p>
                  )}
                  <div className="mt-auto pt-4">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                      <span>{ms(now.progress_ms)}</span>
                      <span>{ms(now.duration_ms)}</span>
                    </div>
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
            <CardLabel>current track · waveform</CardLabel>
            <div className="mt-3">
              <Waveform peaks={now?.curves?.waveform ?? []} progress={progress} />
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
            <CardLabel>up next</CardLabel>
            <ScrollArea className="mt-3 h-72">
              <div className="space-y-1 pr-3">
                {upnext.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    queue is empty
                  </p>
                )}
                {upnext.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-md p-2">
                    <span className="w-9 shrink-0 text-sm font-semibold text-primary">
                      {t.camelot}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{t.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {t.artists} · {t.transition}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{t.bpm.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
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
