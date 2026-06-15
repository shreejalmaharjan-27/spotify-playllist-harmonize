"use client";

import { useEffect, useRef } from "react";
import { fitCanvas, readBars, type VizProps } from "./audio";

const N = 64; // number of bars

// WMP "Bars and Waves": a fire-gradient frequency spectrum (real FFT) with
// falling peak caps and a faded reflection below the baseline.
export function FireBars({ analyser, onClick, onContextMenu }: VizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const state = useRef({ vals: new Float32Array(N), peaks: new Float32Array(N) });

  useEffect(() => {
    let running = true;
    const freq = new Uint8Array(1024);

    const draw = () => {
      if (!running) return;
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const [cw, ch] = fitCanvas(canvas);
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cw, ch);

      const an = analyser.current;
      const { vals, peaks } = state.current;
      if (an) {
        an.getByteFrequencyData(freq);
        readBars(freq, vals, 1.7, 0.7);
      } else {
        for (let i = 0; i < N; i++) vals[i] *= 0.9;
      }
      for (let i = 0; i < N; i++) {
        if (vals[i] > peaks[i]) peaks[i] = vals[i];
        else peaks[i] = Math.max(0, peaks[i] - 0.009);
      }

      const baseline = ch * 0.7;
      const maxBar = ch * 0.64;
      const gap = 2;
      const bw = (cw - gap * (N + 1)) / N;

      for (let i = 0; i < N; i++) {
        const v = vals[i];
        const bh = Math.max(2, v * maxBar);
        const x = gap + i * (bw + gap);

        const grad = ctx.createLinearGradient(0, baseline - bh, 0, baseline);
        grad.addColorStop(0, `hsl(${52 - v * 8}, 100%, ${Math.min(96, 60 + v * 38)}%)`);
        grad.addColorStop(0.45, "hsl(35, 100%, 55%)");
        grad.addColorStop(1, "hsl(12, 100%, 46%)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, baseline - bh, bw, bh);

        if (v > 0.55) {
          ctx.shadowColor = "rgba(255,200,90,0.8)";
          ctx.shadowBlur = 8;
          ctx.fillRect(x, baseline - bh, bw, 3);
          ctx.shadowBlur = 0;
        }

        const ph = Math.max(2, peaks[i] * maxBar);
        ctx.fillStyle = "rgba(255,244,214,0.92)";
        ctx.fillRect(x, baseline - ph - 2, bw, 2);

        const refl = ctx.createLinearGradient(0, baseline, 0, baseline + bh * 0.55);
        refl.addColorStop(0, "hsla(28, 100%, 52%, 0.22)");
        refl.addColorStop(1, "hsla(12, 100%, 46%, 0)");
        ctx.fillStyle = refl;
        ctx.fillRect(x, baseline, bw, bh * 0.55);
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
