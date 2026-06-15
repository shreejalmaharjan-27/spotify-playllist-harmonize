"use client";

import { useEffect, useRef } from "react";
import { bands, fitCanvas, type VizProps } from "./audio";

const GW = 150; // grid resolution (the pattern is computed on a square plate)

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// Chladni standing-wave node patterns (sand on a vibrating plate). The mode
// numbers (n, m) follow the music's low/high bands and morph smoothly; the
// node lines glow. Computed cheaply via separable cosine row/col arrays.
export function Cymatics({ analyser, now, onClick, onContextMenu }: VizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const off = useRef<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData; gh: number } | null>(null);
  const nm = useRef({ n: 4, m: 5 });
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    let running = true;
    const freq = new Uint8Array(1024);
    const lut = new Uint8Array(256 * 3);

    const draw = () => {
      if (!running) return;
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const [cw, ch, dpr] = fitCanvas(canvas);
      const GH = Math.max(40, Math.round(GW * (ch / cw)));

      let o = off.current;
      if (!o || o.gh !== GH) {
        const c = document.createElement("canvas");
        c.width = GW; c.height = GH;
        const octx = c.getContext("2d")!;
        o = { canvas: c, ctx: octx, img: octx.createImageData(GW, GH), gh: GH };
        off.current = o;
      }

      const an = analyser.current;
      if (an) an.getByteFrequencyData(freq);
      const bd = an ? bands(freq) : { bass: 0.2, mid: 0.2, treb: 0.2, level: 0.2 };

      // mode numbers follow bass (n) and treble (m), morphing smoothly
      const tN = 2 + bd.bass * 9;
      const tM = 3 + bd.treb * 12;
      nm.current.n += (tN - nm.current.n) * 0.05;
      nm.current.m += (tM - nm.current.m) * 0.05;
      const n = nm.current.n, m = nm.current.m;
      const amp = 0.4 + bd.level * 1.2;

      // separable cosines (cheap): only GW+GH cos calls
      const cnx = new Float32Array(GW), cmx = new Float32Array(GW);
      for (let x = 0; x < GW; x++) { const u = x / (GW - 1); cnx[x] = Math.cos(n * Math.PI * u); cmx[x] = Math.cos(m * Math.PI * u); }
      const cny = new Float32Array(GH), cmy = new Float32Array(GH);
      for (let y = 0; y < GH; y++) { const v = y / (GH - 1); cny[y] = Math.cos(n * Math.PI * v); cmy[y] = Math.cos(m * Math.PI * v); }

      // colour LUT: dark plate → glowing node colour (hue from energy)
      const hue = ((nowRef.current?.energy ?? 0.5) * 140 + 160) % 360;
      const [nr, ng, nb] = hslToRgb(hue, 0.85, 0.6);
      for (let i = 0; i < 256; i++) {
        const t = i / 255;
        lut[i * 3] = 6 + (nr - 6) * t + (255 - nr) * t * t * t;
        lut[i * 3 + 1] = 9 + (ng - 9) * t + (255 - ng) * t * t * t;
        lut[i * 3 + 2] = 16 + (nb - 16) * t + (255 - nb) * t * t * t;
      }

      const data = o.img.data;
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          const z = cnx[x] * cny[y] - cmx[x] * cmy[y];
          const inten = Math.exp(-(z * z) * 26) * amp; // bright thin node lines
          const idx = Math.min(255, Math.max(0, Math.round(inten * 255)));
          const li = idx * 3;
          const o4 = (y * GW + x) * 4;
          data[o4] = lut[li]; data[o4 + 1] = lut[li + 1]; data[o4 + 2] = lut[li + 2]; data[o4 + 3] = 255;
        }
      }
      o.ctx.putImageData(o.img, 0, 0);

      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(o.canvas, 0, 0, GW, GH, 0, 0, cw, ch);

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
