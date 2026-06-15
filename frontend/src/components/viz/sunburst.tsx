"use client";

import { useEffect, useRef } from "react";
import { bands, fitCanvas, readBars, type VizProps } from "./audio";

const N = 110; // radial bars around the ring

// Circular FFT bars radiating from a slowly spinning album-art disc. Bass
// pulses the inner radius; loud bars glow; hue drifts with time + energy.
export function Sunburst({ analyser, now, onClick, onContextMenu }: VizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const vals = useRef(new Float32Array(N));
  const art = useRef<{ img: HTMLImageElement | null; url: string; ready: boolean }>({ img: null, url: "", ready: false });
  const spin = useRef(0);
  const pulse = useRef(0);

  // (re)load album art when the track changes
  useEffect(() => {
    const url = now?.album_art ?? "";
    if (url && url !== art.current.url) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { art.current.ready = true; };
      img.src = url;
      art.current = { img, url, ready: false };
    } else if (!url) {
      art.current = { img: null, url: "", ready: false };
    }
  }, [now?.album_art]);

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
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, cw, ch);

      const an = analyser.current;
      if (an) { an.getByteFrequencyData(freq); readBars(freq, vals.current, 1.6, 0.65); }
      else for (let i = 0; i < N; i++) vals.current[i] *= 0.92;
      const b = an ? bands(freq) : { bass: 0, mid: 0, treb: 0, level: 0 };
      pulse.current = pulse.current * 0.85 + b.bass * 0.15;

      const cx = cw / 2;
      const cy = ch / 2;
      const base = Math.min(cw, ch) * 0.17;
      const r0 = base * (1 + pulse.current * 0.35);
      const maxLen = Math.min(cw, ch) * 0.3;
      spin.current += 0.0016 + b.level * 0.004;
      const hueBase = (performance.now() * 0.01 + (now?.energy ?? 0.5) * 120) % 360;

      // radial bars (mirrored both halves come naturally from the full circle)
      ctx.lineCap = "round";
      for (let i = 0; i < N; i++) {
        const v = vals.current[i];
        const ang = (i / N) * Math.PI * 2 + spin.current;
        const len = 3 + v * maxLen;
        const x1 = cx + Math.cos(ang) * r0;
        const y1 = cy + Math.sin(ang) * r0;
        const x2 = cx + Math.cos(ang) * (r0 + len);
        const y2 = cy + Math.sin(ang) * (r0 + len);
        const hue = (hueBase + (i / N) * 90) % 360;
        ctx.strokeStyle = `hsl(${hue}, 90%, ${50 + v * 35}%)`;
        ctx.lineWidth = Math.max(1.5, (Math.PI * 2 * r0) / N - 2);
        if (v > 0.6) { ctx.shadowColor = `hsl(${hue},95%,65%)`; ctx.shadowBlur = 14; } else ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // album-art disc in the centre, slowly rotating
      const a = art.current;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r0 - 4, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (a.ready && a.img) {
        ctx.translate(cx, cy);
        ctx.rotate(spin.current * 0.5);
        const d = (r0 - 4) * 2;
        ctx.drawImage(a.img, -d / 2, -d / 2, d, d);
      } else {
        ctx.fillStyle = "#15161f";
        ctx.fillRect(cx - r0, cy - r0, r0 * 2, r0 * 2);
      }
      ctx.restore();
      // subtle rim
      ctx.beginPath();
      ctx.arc(cx, cy, r0 - 3, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      ctx.stroke();

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
