"use client";

import { Area, AreaChart, Line, ReferenceDot, ResponsiveContainer, YAxis } from "recharts";

// The set's energy curve: target (where the DJ arc wants the energy) vs the
// actual sequenced energy, with a marker at the currently-playing position.
export function EnergyArc({
  target,
  actual,
  pos,
}: {
  target: number[];
  actual: number[];
  pos: number | null;
}) {
  const data = actual.map((e, i) => ({ i, actual: e, target: target[i] ?? null }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <YAxis domain={[0, 1]} hide />
        <Line
          type="monotone"
          dataKey="target"
          stroke="var(--muted-foreground)"
          strokeWidth={1}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="actual"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="url(#energyFill)"
          dot={false}
          isAnimationActive={false}
        />
        {pos != null && actual[pos] != null && (
          <ReferenceDot
            x={pos}
            y={actual[pos]}
            r={5}
            fill="var(--primary)"
            stroke="var(--background)"
            strokeWidth={2}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
