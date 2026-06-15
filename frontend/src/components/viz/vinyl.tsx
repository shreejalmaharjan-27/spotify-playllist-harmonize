"use client";

import { useEffect, useRef } from "react";
import { bands, clockPos, fitCanvas, makeClock, syncClock, type VizProps } from "./audio";

// A spinning record: the track's waveform is etched as a tightening spiral
// groove, the played portion glowing in accent; a tonearm rides the playhead
// radius; the album-art label spins in the centre. Bass gives a subtle wobble
// and the needle contact glows with the live level.
export function Vinyl({ analyser, now, onClick, onContextMenu }: VizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const clock = useRef(makeClock());
  const art = useRef<{ img: HTMLImageElement | null; url: string; ready: boolean }>({ img: null, url: "", ready: false });
  const rot = useRef(0);
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => { syncClock(clock.current, now); }, [now?.id, now?.progress_ms, now?.is_playing, now?.duration_ms, now]);

  useEffect(() => {
    const url = now?.album_art ?? "";
    if (url && url !== art.current.url) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { art.current.ready = true; };
      img.src = url;
      art.current = { img, url, ready: false };
    } else if (!url) art.current = { img: null, url: "", ready: false };
  }, [now?.album_art]);

  useEffect(() => {
    let running = true;
    const freq = new Uint8Array(1024);
    let lvl = 0;

    const draw = () => {
      if (!running) return;
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const [cw, ch, dpr] = fitCanvas(canvas);
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0a0a0c";
      ctx.fillRect(0, 0, cw, ch);

      const cur = nowRef.current;
      const an = analyser.current;
      if (an) an.getByteFrequencyData(freq);
      const bd = an ? bands(freq) : { bass: 0, mid: 0, treb: 0, level: 0 };
      lvl = lvl * 0.8 + bd.level * 0.2;

      const cx = cw / 2;
      const cy = ch / 2;
      const discR = Math.min(cw, ch) * 0.42 * (1 + bd.bass * 0.012);
      const labelR = discR * 0.34;
      rot.current += 0.018 + lvl * 0.01;

      // vinyl body + sheen
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, discR, 0, Math.PI * 2); ctx.fillStyle = "#0c0c10"; ctx.fill();
      const sheen = ctx.createRadialGradient(cx - discR * 0.4, cy - discR * 0.4, discR * 0.1, cx, cy, discR);
      sheen.addColorStop(0, "rgba(255,255,255,0.08)");
      sheen.addColorStop(0.5, "rgba(255,255,255,0.015)");
      sheen.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = sheen; ctx.fill();

      // faint concentric grooves
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let r = labelR + 4; r < discR - 2; r += 3) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }

      // waveform etched as a tightening spiral; played part glows
      const wf = cur?.curves?.waveform ?? [];
      const dur = clock.current.duration || 1;
      const progress = Math.min(1, Math.max(0, clockPos(clock.current) / dur));
      const turns = 26;
      const STEPS = 900;
      const hue = ((cur?.energy ?? 0.5) * 200 + 20) % 360;
      ctx.lineWidth = 1.6;
      let needleR = discR * 0.95;
      ctx.beginPath();
      for (let s = 0; s <= STEPS; s++) {
        const t = s / STEPS; // 0 = outer/start → 1 = inner/end
        const baseR = discR * 0.95 - t * (discR * 0.95 - labelR - 6);
        const amp = wf.length ? wf[Math.min(wf.length - 1, Math.floor(t * wf.length))] : 0;
        const r = baseR + amp * (discR * 0.05);
        const a = t * turns * Math.PI * 2 + rot.current;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        if (Math.abs(t - progress) < 0.5 / STEPS) needleR = baseR;
      }
      ctx.strokeStyle = "rgba(180,180,190,0.30)";
      ctx.stroke();
      // re-draw the played portion brighter
      ctx.beginPath();
      const played = Math.max(1, Math.floor(progress * STEPS));
      for (let s = 0; s <= played; s++) {
        const t = s / STEPS;
        const baseR = discR * 0.95 - t * (discR * 0.95 - labelR - 6);
        const amp = wf.length ? wf[Math.min(wf.length - 1, Math.floor(t * wf.length))] : 0;
        const r = baseR + amp * (discR * 0.05);
        const a = t * turns * Math.PI * 2 + rot.current;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsl(${hue}, 90%, 62%)`;
      ctx.stroke();
      ctx.restore();

      // centre label (album art), rotating with the disc
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot.current);
      ctx.beginPath(); ctx.arc(0, 0, labelR, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      const a = art.current;
      if (a.ready && a.img) ctx.drawImage(a.img, -labelR, -labelR, labelR * 2, labelR * 2);
      else { ctx.fillStyle = `hsl(${hue},60%,40%)`; ctx.fillRect(-labelR, -labelR, labelR * 2, labelR * 2); }
      ctx.restore();
      // spindle
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fillStyle = "#222"; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, labelR, 0, Math.PI * 2); ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 2; ctx.stroke();

      // needle contact glow at the playhead radius
      const na = -Math.PI / 5; // contact angle (toward top-right)
      const ncx = cx + Math.cos(na) * needleR;
      const ncy = cy + Math.sin(na) * needleR;
      const glow = ctx.createRadialGradient(ncx, ncy, 0, ncx, ncy, 16 + lvl * 30);
      glow.addColorStop(0, `hsla(${hue},100%,70%,${0.5 + lvl})`);
      glow.addColorStop(1, "hsla(0,0%,0%,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ncx, ncy, 16 + lvl * 30, 0, Math.PI * 2); ctx.fill();

      // tonearm
      const pivot = [cx + discR * 1.05, cy - discR * 0.95] as const;
      ctx.strokeStyle = "#d8d8de"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(pivot[0], pivot[1]); ctx.lineTo(ncx, ncy); ctx.stroke();
      ctx.fillStyle = "#bbb"; ctx.beginPath(); ctx.arc(pivot[0], pivot[1], 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e8e8ee"; ctx.fillRect(ncx - 5, ncy - 3, 10, 8);

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
