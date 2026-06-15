"use client";

import { useEffect, useRef } from "react";
import { bands, fitCanvas, readBars, type VizProps } from "./audio";

const N = 96; // surface points around the orb

// A glowing orb whose size rides the bass and whose edge ripples with the
// spectrum. Kicks are detected from the bass band itself (rising above its
// running average) — each one punches the orb bigger and fires an expanding
// shockwave ring. Reacts hard to the beat, independent of any playback offset.
export function BeatBloom({ analyser, now, onClick, onContextMenu }: VizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const bars = useRef(new Float32Array(N));
  const waves = useRef<{ r: number; life: number; hue: number }[]>([]);
  const st = useRef({ smBass: 0, bassAvg: 0.12, punch: 0, lastKick: 0, rot: 0 });
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    let running = true;
    const freq = new Uint8Array(1024);

    const draw = () => {
      if (!running) return;
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const [cw, ch, dpr] = fitCanvas(canvas);
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#04050c";
      ctx.fillRect(0, 0, cw, ch);

      const an = analyser.current;
      if (an) { an.getByteFrequencyData(freq); readBars(freq, bars.current, 1.5, 0.55); }
      else for (let i = 0; i < N; i++) bars.current[i] *= 0.93;
      const bd = an ? bands(freq) : { bass: 0, mid: 0, treb: 0, level: 0 };
      const s = st.current;
      s.smBass = s.smBass * 0.78 + bd.bass * 0.22;
      s.bassAvg = s.bassAvg * 0.96 + bd.bass * 0.04;

      const tnow = performance.now();
      const hue = ((nowRef.current?.energy ?? 0.5) * 200 + tnow * 0.01) % 360;

      // kick detection — bass rising sharply above its average, with cooldown
      if (bd.bass > s.bassAvg * 1.35 + 0.05 && bd.bass > 0.18 && tnow - s.lastKick > 130) {
        s.lastKick = tnow;
        s.punch = Math.min(1.2, s.punch + 0.65);
        waves.current.push({ r: 0, life: 1, hue });
        if (waves.current.length > 16) waves.current.shift();
      }
      s.punch *= 0.88;
      s.rot += 0.003 + bd.level * 0.012;

      const cx = cw / 2;
      const cy = ch / 2;
      const baseR = Math.min(cw, ch) * 0.13;
      const r = baseR * (1 + s.smBass * 0.7 + s.punch * 0.5);
      const maxR = Math.hypot(cw, ch) * 0.6;

      // shockwave rings
      for (let i = waves.current.length - 1; i >= 0; i--) {
        const w = waves.current[i];
        w.r += maxR * 0.011 + 4;
        w.life -= 0.011;
        if (w.life <= 0 || w.r > maxR) { waves.current.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(cx, cy, r + w.r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${w.hue}, 90%, 65%, ${w.life * 0.5})`;
        ctx.lineWidth = 1 + w.life * 3;
        ctx.stroke();
      }

      // soft core glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4);
      glow.addColorStop(0, `hsla(${hue}, 95%, 75%, ${0.45 + s.smBass * 0.4})`);
      glow.addColorStop(0.4, `hsla(${(hue + 30) % 360}, 90%, 55%, 0.35)`);
      glow.addColorStop(1, "hsla(0,0%,0%,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2); ctx.fill();

      // orb body — edge rippled by the spectrum
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2 + s.rot;
        const m = bars.current[i % N];
        const rr = r * (1 + 0.32 * m);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const body = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.35);
      body.addColorStop(0, `hsl(${hue}, 95%, ${62 + s.smBass * 18}%)`);
      body.addColorStop(1, `hsl(${(hue + 40) % 360}, 90%, 42%)`);
      ctx.fillStyle = body;
      ctx.fill();
      ctx.strokeStyle = `hsl(${hue}, 100%, 86%)`;
      ctx.lineWidth = 2;
      ctx.stroke();

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
