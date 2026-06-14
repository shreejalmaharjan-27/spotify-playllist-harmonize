"use client";

// Highlights the current Camelot key and its harmonically-compatible neighbours
// (same / relative / ±1) — the keys a DJ can mix into seamlessly.
function compatibleSet(code: string): Set<string> {
  const num = parseInt(code);
  const letter = code.slice(-1);
  const other = letter === "A" ? "B" : "A";
  return new Set([
    code,
    `${(num % 12) + 1}${letter}`,
    `${((num + 10) % 12) + 1}${letter}`,
    `${num}${other}`,
  ]);
}

export function CamelotWheel({ code, size = 160 }: { code?: string; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 12;
  const rInner = rOuter - size * 0.16;
  const compat = code ? compatibleSet(code) : new Set<string>();

  const dot = (i: number, ring: number, letter: "A" | "B") => {
    const ang = ((i - 1) / 12) * 2 * Math.PI - Math.PI / 2;
    const x = cx + Math.cos(ang) * ring;
    const y = cy + Math.sin(ang) * ring;
    const c = `${i}${letter}`;
    const on = c === code;
    const ok = compat.has(c);
    return (
      <g key={c}>
        <circle
          cx={x}
          cy={y}
          r={on ? 11 : 9}
          className={
            on
              ? "fill-primary"
              : ok
                ? "fill-primary/25"
                : "fill-muted"
          }
        />
        <text
          x={x}
          y={y + 3}
          textAnchor="middle"
          className={
            "text-[8px] font-medium " +
            (on ? "fill-primary-foreground" : ok ? "fill-foreground" : "fill-muted-foreground/60")
          }
        >
          {c}
        </text>
      </g>
    );
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {Array.from({ length: 12 }, (_, k) => dot(k + 1, rOuter, "B"))}
      {Array.from({ length: 12 }, (_, k) => dot(k + 1, rInner, "A"))}
    </svg>
  );
}
