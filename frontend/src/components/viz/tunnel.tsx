"use client";

import { useEffect, useRef } from "react";
import { bands, clockPos, fitCanvas, makeClock, readBars, syncClock, type VizProps } from "./audio";

const RINGS = 26;
const PTS = 64; // points per ring (radius modulated by the spectrum)

// Endless flight through pulsing concentric rings. Rings recede from the centre
// and accelerate outward (perspective); each ring's radius is modulated by the
// frequency spectrum so it bulges where the music is loud. Beats flash a bright
// ring down the tunnel.
export function Tunnel({ analyser, now, onClick, onContextMenu }: VizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const bars = useRef(new Float32Array(PTS));
  const clock = useRef(makeClock());
  const nowRef = useRef(now);
  nowRef.current = now;
  const scroll = useRef(0);
  const rot = useRef(0);

  useEffect(() => { syncClock(clock.current, now); }, [now?.id, now?.progress_ms, now?.is_playing, now?.duration_ms, now]);

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
      ctx.fillStyle = "#04040a";
      ctx.fillRect(0, 0, cw, ch);

      const an = analyser.current;
      if (an) { an.getByteFrequencyData(freq); readBars(freq, bars.current, 1.5, 0.55); }
      else for (let i = 0; i < PTS; i++) bars.current[i] *= 0.92;
      const bd = an ? bands(freq) : { bass: 0, mid: 0, treb: 0, level: 0 };

      const cx = cw / 2;
      const cy = ch / 2;
      const maxR = Math.hypot(cw, cy) * 0.62;
      const energy = nowRef.current?.energy ?? 0.4;
      scroll.current = (scroll.current + 0.0035 + bd.level * 0.02) % 1;
      rot.current += 0.001 + bd.level * 0.006;

      // beat phase for a flash
      const bpm = nowRef.current?.bpm ?? 0;
      const pos = clockPos(clock.current) / 1000;
      const phase = bpm ? ((pos * bpm) / 60) % 1 : 1;
      const beat = (1 - phase) * (1 - phase);

      const tm = performance.now() * 0.02;
      ctx.lineJoin = "round";
      // far rings first
      for (let i = RINGS - 1; i >= 0; i--) {
        const z = ((i / RINGS) + scroll.current) % 1;
        const baseR = maxR * Math.pow(z, 1.9);
        if (baseR < 2) continue;
        const ringRot = rot.current + z * 2.2;
        const alpha = Math.min(1, z * 1.6) * (1 - z * 0.15);
        const hue = (tm + (i / RINGS) * 200 + energy * 120) % 360;
        const light = 45 + z * 25 + beat * 25;
        ctx.beginPath();
        for (let j = 0; j <= PTS; j++) {
          const a = (j / PTS) * Math.PI * 2 + ringRot;
          const m = bars.current[j % PTS];
          const r = baseR * (1 + 0.22 * m);
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `hsla(${hue}, 90%, ${light}%, ${alpha})`;
        ctx.lineWidth = 1 + z * 6;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

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
