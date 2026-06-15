"use client";

import { useEffect, useRef } from "react";
import { bands, clockPos, fitCanvas, makeClock, readBars, syncClock, type VizProps } from "./audio";

const RIM = 72; // outer spectrum bars

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

// DJ-native mandala: the Camelot wheel as a living form. The current key glows
// and links to its mixable neighbours; rings pulse to the BPM and breathe with
// energy; an outer FFT rim is tinted by the track's harmonic key.
export function Mandala({ analyser, now, onClick, onContextMenu }: VizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const vals = useRef(new Float32Array(RIM));
  const clock = useRef(makeClock());
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => { syncClock(clock.current, now); }, [now?.id, now?.progress_ms, now?.is_playing, now?.duration_ms, now]);

  useEffect(() => {
    let running = true;
    const freq = new Uint8Array(1024);

    const nodePos = (i: number, letter: "A" | "B", r: number, cx: number, cy: number, rot: number) => {
      const ang = ((i - 1) / 12) * Math.PI * 2 - Math.PI / 2 + rot;
      return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, ang] as const;
    };

    const draw = () => {
      if (!running) return;
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const [cw, ch] = fitCanvas(canvas);
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#04050a";
      ctx.fillRect(0, 0, cw, ch);

      const cur = nowRef.current;
      const an = analyser.current;
      if (an) { an.getByteFrequencyData(freq); readBars(freq, vals.current, 1.6, 0.6); }
      else for (let i = 0; i < RIM; i++) vals.current[i] *= 0.92;
      const bd = an ? bands(freq) : { bass: 0, mid: 0, treb: 0, level: 0 };

      const cx = cw / 2;
      const cy = ch / 2;
      const wheelR = Math.min(cw, ch) * 0.27;
      const rB = wheelR;       // outer ring (major / B)
      const rA = wheelR * 0.68; // inner ring (minor / A)
      const rot = performance.now() * 0.00006;

      // beat phase from bpm + smooth clock → bright pulse at each beat
      const bpm = cur?.bpm ?? 0;
      const pos = clockPos(clock.current) / 1000;
      const phase = bpm ? ((pos * bpm) / 60) % 1 : 0;
      const beat = (1 - phase) * (1 - phase); // 1 at the beat, decays
      const energy = cur?.energy ?? 0.4;

      const code = cur?.camelot;
      const compat = code ? compatibleSet(code) : new Set<string>();
      const keyNum = code ? parseInt(code) : 8;
      const keyHue = (keyNum / 12) * 360;

      // expanding pulse rings on the beat
      for (let k = 0; k < 3; k++) {
        const rr = wheelR * (1.05 + (phase + k) * 0.18);
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${keyHue}, 80%, 60%, ${Math.max(0, 0.22 - phase * 0.22) * (1 - k * 0.3)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // outer FFT rim, tinted by the key
      ctx.lineCap = "round";
      for (let i = 0; i < RIM; i++) {
        const v = vals.current[i];
        const ang = (i / RIM) * Math.PI * 2 + rot;
        const r0 = wheelR * 1.18;
        const len = 4 + v * Math.min(cw, ch) * 0.16;
        ctx.strokeStyle = `hsl(${(keyHue + i * 2) % 360}, 85%, ${45 + v * 35}%)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len));
        ctx.stroke();
      }

      // links from the current key to its compatible neighbours
      if (code) {
        const [kx, ky] = nodePos(parseInt(code), code.slice(-1) as "A" | "B", code.slice(-1) === "A" ? rA : rB, cx, cy, rot);
        compat.forEach((c) => {
          if (c === code) return;
          const [nx, ny] = nodePos(parseInt(c), c.slice(-1) as "A" | "B", c.slice(-1) === "A" ? rA : rB, cx, cy, rot);
          ctx.strokeStyle = `hsla(${keyHue}, 90%, 70%, ${0.25 + beat * 0.4})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(kx, ky);
          ctx.lineTo(nx, ny);
          ctx.stroke();
        });
      }

      // the 24 Camelot nodes
      for (let i = 1; i <= 12; i++) {
        for (const [ring, letter] of [[rB, "B"], [rA, "A"]] as const) {
          const c = `${i}${letter}`;
          const [x, y] = nodePos(i, letter, ring, cx, cy, rot);
          const isCur = c === code;
          const ok = compat.has(c);
          const hue = (i / 12) * 360;
          const base = isCur ? 11 : ok ? 8 : 5;
          const rad = base + (isCur ? beat * 7 + energy * 4 : ok ? beat * 2 : 0);
          if (isCur) { ctx.shadowColor = `hsl(${hue},95%,65%)`; ctx.shadowBlur = 22 + beat * 18; }
          else if (ok) { ctx.shadowColor = `hsl(${hue},80%,55%)`; ctx.shadowBlur = 8; }
          else ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fillStyle = isCur
            ? `hsl(${hue}, 95%, ${70 + beat * 20}%)`
            : ok ? `hsl(${hue}, 75%, 58%)` : `hsl(${hue}, 35%, 26%)`;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = isCur ? "#000" : ok ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)";
          ctx.font = `${isCur ? 11 : 9}px var(--font-geist-sans), sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(c, x, y);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    const onVis = () => { if (document.hidden) cancelAnimationFrame(rafRef.current); else if (running) rafRef.current = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", onVis);
    return () => { running = false; cancelAnimationFrame(rafRef.current); document.removeEventListener("visibilitychange", onVis); };
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="absolute inset-0 z-10 size-full cursor-pointer"
    />
  );
}
