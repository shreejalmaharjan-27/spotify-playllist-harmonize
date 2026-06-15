"use client";

import { useEffect, useRef } from "react";
import { bands, clockPos, fitCanvas, makeClock, readBars, syncClock, type VizProps } from "./audio";

const MTN = 64; // mountain spectrum resolution

// 80s outrun: a neon perspective grid scrolling toward a banded sun, with
// spectrum-driven mountains on the horizon and a starfield above. Grid speed
// rides the level; the sun pulses on the beat.
export function Synthwave({ analyser, now, onClick, onContextMenu }: VizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const bars = useRef(new Float32Array(MTN));
  const clock = useRef(makeClock());
  const nowRef = useRef(now);
  nowRef.current = now;
  const scroll = useRef(0);
  const stars = useRef<{ x: number; y: number; r: number }[]>([]);
  const starsFor = useRef(0);

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

      const an = analyser.current;
      if (an) { an.getByteFrequencyData(freq); readBars(freq, bars.current, 1.5, 0.6); }
      else for (let i = 0; i < MTN; i++) bars.current[i] *= 0.94;
      const bd = an ? bands(freq) : { bass: 0, mid: 0, treb: 0, level: 0 };

      const horizon = ch * 0.56;
      const cx = cw / 2;
      const bpm = nowRef.current?.bpm ?? 0;
      const pos = clockPos(clock.current) / 1000;
      const phase = bpm ? ((pos * bpm) / 60) % 1 : 1;
      const beat = (1 - phase) * (1 - phase);

      // sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#13002e");
      sky.addColorStop(0.7, "#3a0a52");
      sky.addColorStop(1, "#ff5e7a");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, horizon);
      // floor base
      ctx.fillStyle = "#0a0118"; ctx.fillRect(0, horizon, cw, ch - horizon);

      // stars (regenerate on resize)
      if (starsFor.current !== Math.round(cw) + Math.round(ch)) {
        const arr = [];
        for (let i = 0; i < 90; i++) arr.push({ x: Math.random() * cw, y: Math.random() * horizon * 0.8, r: Math.random() * 1.3 + 0.2 });
        stars.current = arr; starsFor.current = Math.round(cw) + Math.round(ch);
      }
      ctx.fillStyle = `rgba(255,255,255,${0.5 + bd.treb * 0.4})`;
      for (const s of stars.current) { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }

      // banded sun
      const sunR = Math.min(cw, ch) * 0.16 * (1 + beat * 0.06);
      const sunY = horizon - sunR * 0.35;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, sunY, sunR, 0, Math.PI * 2); ctx.clip();
      const sg = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
      sg.addColorStop(0, "#ffe24a"); sg.addColorStop(0.5, "#ff8a3d"); sg.addColorStop(1, "#ff3d8d");
      ctx.fillStyle = sg; ctx.fillRect(cx - sunR, sunY - sunR, sunR * 2, sunR * 2);
      // scanline gaps in lower half (thicken downward)
      ctx.fillStyle = "#3a0a52";
      for (let i = 0, gap = 2; i < 16; i++, gap += 1.1) {
        const y = sunY + (i / 16) * sunR;
        ctx.fillRect(cx - sunR, y, sunR * 2, gap * 0.5);
      }
      ctx.restore();
      ctx.shadowColor = "#ff5fa2"; ctx.shadowBlur = 30 + beat * 20;
      ctx.beginPath(); ctx.arc(cx, sunY, sunR, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,140,180,0.4)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.shadowBlur = 0;

      // spectrum mountains on the horizon
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      for (let i = 0; i <= MTN; i++) {
        const v = bars.current[Math.min(MTN - 1, i)];
        const x = (i / MTN) * cw;
        const y = horizon - v * ch * 0.18 - 4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(cw, horizon); ctx.closePath();
      ctx.fillStyle = "#180a33"; ctx.fill();
      ctx.strokeStyle = "#16e0e0"; ctx.lineWidth = 1.5; ctx.shadowColor = "#16e0e0"; ctx.shadowBlur = 8;
      ctx.stroke(); ctx.shadowBlur = 0;

      // perspective grid floor
      scroll.current = (scroll.current + 0.004 + bd.level * 0.02) % 1;
      ctx.strokeStyle = "rgba(255,43,214,0.6)";
      ctx.lineWidth = 1.4;
      // horizontal lines (scrolling toward viewer)
      const K = 16;
      for (let k = 0; k < K; k++) {
        const z = ((k / K) + scroll.current) % 1;
        const y = horizon + (ch - horizon) * (z * z);
        ctx.globalAlpha = Math.min(1, z * 1.4);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // vertical rays converging to the vanishing point
      ctx.strokeStyle = "rgba(22,224,224,0.55)";
      const V = 18;
      for (let i = -V; i <= V; i++) {
        const xb = cx + (i / V) * cw * 1.4;
        ctx.beginPath(); ctx.moveTo(cx, horizon); ctx.lineTo(xb, ch); ctx.stroke();
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
