"use client";

import { useEffect, useRef } from "react";
import type { VizProps } from "./audio";

// Infinite Mandelbrot deep-zoom (WebGL fragment shader). Uses emulated double
// precision ("double-single": each coord is a hi+lo float pair, ~46 mantissa
// bits) so the zoom stays crisp ~2x deeper than plain fp32 before pixels start
// collapsing to the same 'c'. Loops via a fade-through-black at the seam.
// Doesn't react to audio (by request); just a hypnotic GPU fractal.
const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

// the deep point we descend into, as JS doubles → split into hi+lo floats below
const CENTER_X = -0.7436438870371587;
const CENTER_Y = 0.13182590420533;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uCenter;   // (cx_hi, cx_lo, cy_hi, cy_lo)

// ---- double-single (df64) arithmetic: value = hi + lo ----
vec2 ds_set(float a){ return vec2(a, 0.0); }
vec2 ds_add(vec2 a, vec2 b){
  float s = a.x + b.x;
  float v = s - a.x;
  float e = (a.x - (s - v)) + (b.x - v) + a.y + b.y;
  float hi = s + e;
  return vec2(hi, e - (hi - s));
}
vec2 ds_mul(vec2 a, vec2 b){
  float SPLIT = 4097.0;                 // 2^12 + 1, for a 24-bit mantissa
  float cona = a.x * SPLIT, conb = b.x * SPLIT;
  float a_hi = cona - (cona - a.x), a_lo = a.x - a_hi;
  float b_hi = conb - (conb - b.x), b_lo = b.x - b_hi;
  float p = a.x * b.x;
  float e = ((a_hi * b_hi - p) + a_hi * b_lo + a_lo * b_hi) + a_lo * b_lo;
  e += a.x * b.y + a.y * b.x;
  float hi = p + e;
  return vec2(hi, e - (hi - p));
}

vec3 palette(float t){
  return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.36, 0.62) + t) + uTime * 0.05);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  float MAXOCT = 19.0;     // octaves before looping — kept inside the crisp range
  float speed = 0.5;       // octaves per second
  float e = mod(uTime * speed, MAXOCT);
  float zoom = pow(2.0, e);

  float ang = uTime * 0.03;
  float ca = cos(ang), sa = sin(ang);
  uv = mat2(ca, -sa, sa, ca) * uv;

  // tiny per-pixel offset (plain float) added precisely onto the df64 centre
  float ox = uv.x * 1.6 / zoom;
  float oy = uv.y * 1.6 / zoom;
  vec2 cr = ds_add(vec2(uCenter.x, uCenter.y), ds_set(ox));
  vec2 ci = ds_add(vec2(uCenter.z, uCenter.w), ds_set(oy));

  // z = z^2 + c, all in double-single
  vec2 zr = ds_set(0.0), zi = ds_set(0.0);
  float dynMax = min(460.0, 150.0 + e * 16.0);
  float it = 0.0;
  float m2 = 0.0;
  for(int i = 0; i < 500; i++){
    if(float(i) >= dynMax) break;
    vec2 zr2 = ds_mul(zr, zr);
    vec2 zi2 = ds_mul(zi, zi);
    m2 = zr2.x + zi2.x;
    if(m2 > 256.0) break;
    vec2 nzr = ds_add(ds_add(zr2, -zi2), cr);    // zr^2 - zi^2 + cr
    vec2 zrzi = ds_mul(zr, zi);
    vec2 nzi = ds_add(ds_add(zrzi, zrzi), ci);   // 2*zr*zi + ci
    zr = nzr; zi = nzi;
    it += 1.0;
  }

  vec3 col;
  if(it > dynMax - 1.5){
    col = vec3(0.02, 0.02, 0.05);                // interior
  } else {
    float lz = log(m2) * 0.5;
    float nu = log(lz / 0.6931472) / 0.6931472;
    float sm = it + 1.0 - nu;                     // smooth iteration count
    col = palette(sm * 0.022);
  }

  // fade in at the start of the cycle, out at the end → seamless loop
  float k = e / MAXOCT;
  col *= smoothstep(0.0, 0.04, k) * (1.0 - smoothstep(0.88, 1.0, k));
  col *= 1.0 - 0.28 * dot(uv, uv);                // vignette
  gl_FragColor = vec4(col, 1.0);
}
`;

export function Fractal({ onClick, onContextMenu }: VizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, depth: false });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn("fractal shader:", gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.warn("fractal link:", gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uCenter = gl.getUniformLocation(prog, "uCenter");
    // split the high-precision centre into hi + lo floats (a GLSL literal would
    // truncate to fp32 and waste the df64 precision)
    const split = (d: number): [number, number] => {
      const hi = Math.fround(d);
      return [hi, Math.fround(d - hi)];
    };
    const [cxh, cxl] = split(CENTER_X);
    const [cyh, cyl] = split(CENTER_Y);

    let running = true;
    const start = performance.now();
    const resize = () => {
      // render at the real display resolution (crisp, no CSS upscale blur);
      // cap the long side so 4K/5K screens don't melt the GPU.
      const cssW = Math.max(1, canvas.clientWidth);
      const cssH = Math.max(1, canvas.clientHeight);
      // df64 iteration is ~6x the arithmetic, so render a touch under full res
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      let w = Math.round(cssW * scale);
      let h = Math.round(cssH * scale);
      const cap = 1900;
      if (Math.max(w, h) > cap) { const fr = cap / Math.max(w, h); w = Math.round(w * fr); h = Math.round(h * fr); }
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = () => {
      if (!running) return;
      resize();
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform4f(uCenter, cxh, cxl, cyh, cyl);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    const onVis = () => { if (document.hidden) cancelAnimationFrame(rafRef.current); else if (running) rafRef.current = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", onVis);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="absolute inset-0 z-10 size-full cursor-pointer"
    />
  );
}
