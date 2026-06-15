"use client";

import { useEffect, useRef } from "react";
import { fitCanvas, makeInferno, type VizProps } from "./audio";

const OH = 256; // frequency rows (vertical resolution of the spectrogram)

// Scrolling frequency-over-time heatmap. Each frame the offscreen image shifts
// left 1px and a fresh column (log-frequency, inferno-coloured) is written on
// the right, so the song's structure flows by like a waterfall.
export function Spectrogram({ analyser, onClick, onContextMenu }: VizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const off = useRef<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; col: ImageData } | null>(null);
  const lut = useRef<Uint8Array | null>(null);

  useEffect(() => {
    let running = true;
    const freq = new Uint8Array(1024);
    if (!lut.current) lut.current = makeInferno();
    const LUT = lut.current;

    const draw = () => {
      if (!running) return;
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const [cw, ch, dpr] = fitCanvas(canvas);
      const OW = Math.max(64, Math.round(cw));

      // (re)allocate offscreen buffer on size change
      let o = off.current;
      if (!o || o.w !== OW) {
        const c = document.createElement("canvas");
        c.width = OW; c.height = OH;
        const octx = c.getContext("2d")!;
        octx.fillStyle = "#05060a";
        octx.fillRect(0, 0, OW, OH);
        o = { canvas: c, ctx: octx, w: OW, col: octx.createImageData(1, OH) };
        off.current = o;
      }

      const an = analyser.current;
      if (an) an.getByteFrequencyData(freq);
      const bins = freq.length;

      // shift left 1px, then write the new rightmost column
      o.ctx.drawImage(o.canvas, -1, 0);
      const data = o.col.data;
      for (let r = 0; r < OH; r++) {
        // r=0 top → treble, r=OH-1 bottom → bass (log mapping)
        const fr = 1 - r / (OH - 1);
        const lo = Math.floor(Math.pow(fr, 2.2) * bins * 0.75);
        const hi = Math.max(lo + 1, Math.floor(Math.pow(Math.min(1, fr + 1 / OH), 2.2) * bins * 0.75));
        let m = 0;
        for (let bI = lo; bI < hi && bI < bins; bI++) if (freq[bI] > m) m = freq[bI];
        const li = m * 3;
        const o4 = r * 4;
        data[o4] = LUT[li];
        data[o4 + 1] = LUT[li + 1];
        data[o4 + 2] = LUT[li + 2];
        data[o4 + 3] = 255;
      }
      o.ctx.putImageData(o.col, OW - 1, 0);

      // blit scaled to the display
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(o.canvas, 0, 0, OW, OH, 0, 0, cw, ch);

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
