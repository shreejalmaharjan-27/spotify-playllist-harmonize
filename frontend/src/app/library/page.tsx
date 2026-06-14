"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Waves } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import type { Coverage, TrackStatus } from "@/lib/types";
import { useLive } from "@/lib/useSocket";

const STATUS_STYLE: Record<TrackStatus, string> = {
  analyzed: "bg-primary/15 text-primary",
  downloaded: "bg-amber-500/15 text-amber-400",
  missing: "bg-muted text-muted-foreground",
  not_in_library: "bg-muted text-muted-foreground",
};

export default function LibraryPage() {
  const { job } = useLive();
  const [cov, setCov] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const running = job?.status === "running";

  const load = useCallback(() => {
    api
      .coverage()
      .then(setCov)
      .catch((e) => toast.error("Couldn't load coverage", { description: String(e) }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);
  // refresh coverage when a job finishes
  useEffect(() => {
    if (job?.status === "done") {
      toast.success(`${job.job} complete`);
      load();
    } else if (job?.status === "error") {
      toast.error(`${job.job} failed`, { description: job.message });
    }
  }, [job?.status, job?.job, job?.message, load]);

  async function start(j: "download" | "analyze") {
    try {
      const r = await api.startJob(j, "all");
      if (r.error) throw new Error(r.error);
      toast.info(`Started ${j}…`);
    } catch (e) {
      toast.error(`Couldn't start ${j}`, { description: String(e) });
    }
  }

  const pct = (n: number) => (cov?.total ? Math.round((n / cov.total) * 100) : 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-lg font-semibold">Library &amp; Data</h1>
        <p className="text-sm text-muted-foreground">
          DJ info only shows for analyzed tracks. Download audio, then analyze it.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="In library" value={cov?.total ?? "—"} sub="tracks in your CSV" />
        <Stat
          label="Downloaded"
          value={cov ? `${cov.downloaded}` : "—"}
          sub={cov ? `${pct(cov.downloaded)}% of library` : ""}
        />
        <Stat
          label="Analyzed"
          value={cov ? `${cov.analyzed}` : "—"}
          sub={cov ? `${pct(cov.analyzed)}% ready to DJ` : ""}
        />
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => start("download")} disabled={running}>
            <Download className="size-4" /> Download all
          </Button>
          <Button onClick={() => start("analyze")} disabled={running} variant="secondary">
            <Waves className="size-4" /> Analyze all
          </Button>
          {running && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {job?.job}: {job?.message}
            </span>
          )}
        </div>
        {running && (
          <div className="space-y-1">
            <Progress value={job?.total ? (job.done / job.total) * 100 : 0} />
            <p className="text-right text-xs text-muted-foreground">
              {job?.done}/{job?.total}
            </p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Heavy one-time jobs (~30–60 min for the full library). They&apos;re cached and resumable,
          so you can safely re-run.
        </p>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            tracks
          </span>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <ScrollArea className="h-[420px]">
          <div className="space-y-0.5 pr-3">
            {cov?.tracks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate">{t.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.artists}</div>
                </div>
                <Badge variant="secondary" className={STATUS_STYLE[t.status]}>
                  {t.status.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="p-5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
