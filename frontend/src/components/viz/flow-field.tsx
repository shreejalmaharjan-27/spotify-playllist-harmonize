"use client";

import { useEffect, useRef } from "react";
import { bands, fitCanvas, type VizProps } from "./audio";

const P = 7000; // particle count

// ~7k particles drifting through an evolving flow field. Bass adds turbulence
// and speed, treble brightens sparks, energy drifts the hue. Motion trails come
// from fading (not clearing) the canvas; additive blending makes them glow.
export function FlowField({ analyser, now, onClick, onContextMenu }: VizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const buf = useRef<{ x: Float32Array; y: Float32Array; life: Float32Array; seed: Float32Array } | null>(null);

  useEffect(() => {
    let running = true;
    const freq = new Uint8Array(1024);
    let smBass = 0;

    // cheap flowing field — curved, slowly evolving (not true Perlin, but looks it)
    const field = (x: number, y: number, t: number) =>
      (Math.sin(x * 1.6 + Math.cos(y * 2.1 + t) * 1.4 + t * 0.4) +
        Math.sin(y * 1.9 - x * 0.8 + t * 0.27)) * Math.PI;

    const draw = () => {
      if (!running) return;
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const [cw, ch] = fitCanvas(canvas);
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // (re)allocate particles
      let b = buf.current;
      if (!b) {
        b = { x: new Float32Array(P), y: new Float32Array(P), life: new Float32Array(P), seed: new Float32Array(P) };
        for (let i = 0; i < P; i++) {
          b.x[i] = Math.random() * cw;
          b.y[i] = Math.random() * ch;
          b.life[i] = Math.random() * 200;
          b.seed[i] = Math.random();
        }
        buf.current = b;
      }

      const an = analyser.current;
      if (an) an.getByteFrequencyData(freq);
      const bd = an ? bands(freq) : { bass: 0, mid: 0, treb: 0, level: 0 };
      smBass = smBass * 0.85 + bd.bass * 0.15;

      // fade previous frame (trails)
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(5,6,12,0.14)";
      ctx.fillRect(0, 0, cw, ch);

      // draw particles additively
      ctx.globalCompositeOperation = "lighter";
      const t = performance.now() * 0.00012;
      const scale = 0.006;
      const speed = 0.8 + smBass * 4.5;
      const turb = 1 + bd.bass * 1.5;
      const hueBase = ((now?.energy ?? 0.5) * 200 + performance.now() * 0.008) % 360;
      const sparkle = bd.treb;

      for (let i = 0; i < P; i++) {
        const ang = field(b.x[i] * scale, b.y[i] * scale, t * turb) + b.seed[i] * 0.6;
        b.x[i] += Math.cos(ang) * speed;
        b.y[i] += Math.sin(ang) * speed;
        b.life[i] -= 1;
        if (b.life[i] <= 0 || b.x[i] < 0 || b.x[i] > cw || b.y[i] < 0 || b.y[i] > ch) {
          b.x[i] = Math.random() * cw;
          b.y[i] = Math.random() * ch;
          b.life[i] = 60 + Math.random() * 200;
        }
        const spark = b.seed[i] < sparkle * 0.5;
        const hue = (hueBase + b.seed[i] * 70) % 360;
        const light = spark ? 85 : 55 + smBass * 25;
        ctx.fillStyle = `hsla(${hue}, 90%, ${light}%, ${spark ? 0.9 : 0.5})`;
        const s = spark ? 2.2 : 1.3;
        ctx.fillRect(b.x[i], b.y[i], s, s);
      }
      ctx.globalCompositeOperation = "source-over";

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    const onVis = () => { if (document.hidden) cancelAnimationFrame(rafRef.current); else if (running) rafRef.current = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", onVis);
    return () => { running = false; cancelAnimationFrame(rafRef.current); document.removeEventListener("visibilitychange", onVis); };
  }, [analyser, now?.energy]);

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="absolute inset-0 z-10 size-full cursor-pointer"
    />
  );
}
