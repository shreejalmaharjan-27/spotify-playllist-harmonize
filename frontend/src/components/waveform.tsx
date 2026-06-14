"use client";

// Clean bar waveform with a playhead: bars before the playhead use the accent,
// the rest are muted. Mirrored around the centre line like a DAW track.
export function Waveform({
  peaks,
  progress,
  height = 96,
}: {
  peaks: number[];
  progress: number; // 0..1
  height?: number;
}) {
  if (!peaks.length) {
    return <div className="h-full w-full rounded-md bg-muted/30" />;
  }
  const max = Math.max(...peaks) || 1;
  const n = peaks.length;
  const playedTo = Math.floor(progress * n);
  const gap = 1;
  const barW = 100 / n;

  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      {peaks.map((p, i) => {
        const h = Math.max(1.5, (p / max) * (height - 4));
        const x = i * barW;
        const played = i <= playedTo;
        return (
          <rect
            key={i}
            x={x}
            y={(height - h) / 2}
            width={Math.max(0.4, barW - gap / n)}
            height={h}
            rx={0.6}
            className={played ? "fill-primary" : "fill-muted-foreground/35"}
          />
        );
      })}
    </svg>
  );
}
