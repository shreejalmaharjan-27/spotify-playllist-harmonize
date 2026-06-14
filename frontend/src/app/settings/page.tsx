"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api, API_BASE } from "@/lib/api";

const WEIGHTS = [
  ["Key (Camelot harmonic)", "1.0"],
  ["Energy arc (build/drop)", "1.2"],
  ["Energy smoothness", "0.7"],
  ["Tempo (half/double-time)", "0.6"],
  ["Groove continuity", "0.4"],
];

export default function SettingsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .authStatus()
      .then((d) => setAuthed(d.authenticated))
      .catch(() => setAuthed(false));
    // surface the OAuth callback result (?auth=ok|error)
    const p = new URLSearchParams(window.location.search).get("auth");
    if (p === "ok") toast.success("Connected to Spotify");
    else if (p === "error") toast.error("Spotify connection failed");
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Connection, playback, and how the set is built.</p>
      </header>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Spotify</h2>
            <p className="text-sm text-muted-foreground">
              Premium required for playback control.
            </p>
          </div>
          {authed == null ? (
            <Badge variant="secondary">checking…</Badge>
          ) : authed ? (
            <Badge className="bg-primary/15 text-primary">
              <CheckCircle2 className="size-3.5" /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-muted-foreground">
              <XCircle className="size-3.5" /> Not connected
            </Badge>
          )}
        </div>
        <a href={api.loginUrl()} className={buttonVariants({ className: "w-fit" })}>
          {authed ? "Reconnect Spotify" : "Connect Spotify"}
          <ExternalLink className="size-4" />
        </a>
        <p className="text-xs text-muted-foreground">
          Add <code className="rounded bg-muted px-1 py-0.5">{API_BASE}/auth/callback</code> to your
          Spotify app&apos;s Redirect URIs (use 127.0.0.1, not localhost).
        </p>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-medium">Seamless blends</h2>
        <p className="text-sm text-muted-foreground">
          The Web API can&apos;t crossfade audio — turn on Spotify&apos;s built-in{" "}
          <span className="text-foreground">Settings → Playback → Crossfade (~10s)</span> so the
          well-ordered tracks blend like a DJ set.
        </p>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-medium">Sequencing weights</h2>
        <p className="text-sm text-muted-foreground">
          How much each axis matters when ordering the set.
        </p>
        <Separator />
        <div className="space-y-2">
          {WEIGHTS.map(([label, w]) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono">{w}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
