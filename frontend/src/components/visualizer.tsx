"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { NowPlaying } from "@/lib/types";
import { API_BASE } from "@/lib/api";

// ──────────────────────────────────────────────────────────
// Butterchurn types
// ──────────────────────────────────────────────────────────
interface BcVisualizer {
    connectAudio(node: AudioNode): void;
    disconnectAudio(node: AudioNode): void;
    loadPreset(preset: object, blendTime: number): void;
    setRendererSize(w: number, h: number): void;
    render(): void;
}

// ──────────────────────────────────────────────────────────
// Fallback constants
// ──────────────────────────────────────────────────────────
type FallbackMode = "fire" | "bars" | "wave";
const FALLBACK_LABELS: Record<FallbackMode, string> = {
    fire: "Forest Fire",
    bars: "Spectrum Bars",
    wave: "Oscilloscope",
};

// ──────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────
export function Visualizer({ now }: { now: NowPlaying | null }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const bcRef = useRef<BcVisualizer | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const gainRef = useRef<GainNode | null>(null);
    const rafRef = useRef(0);
    const presetIdxRef = useRef(0);
    const presetMapRef = useRef<Record<string, object> | null>(null);
    const presetKeysRef = useRef<string[]>([]);
    const activeKeyRef = useRef<string | null>(null);
    const manualRef = useRef(false); // user manually picked → don't auto-cycle
    const flashRef = useRef({ text: "", until: 0 });
    const overlayRef = useRef<HTMLDivElement>(null);
    const [useBc, setUseBc] = useState<boolean | null>(null);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
    const [search, setSearch] = useState("");
    const [favs, setFavs] = useState<Set<string>>(() => loadSet("djset-viz-favs"));
    const [blocked, setBlocked] = useState<Set<string>>(() => loadSet("djset-viz-blocked"));

    // ── Favorites / blocked persistence ──────────────────
    function loadSet(key: string) {
        try { return new Set<string>(JSON.parse(localStorage.getItem(key) ?? "[]")); }
        catch { return new Set<string>(); }
    }
    function saveSet(key: string, s: Set<string>) { try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* */ } }
    const toggleFav = useCallback((k: string) => { setFavs((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); saveSet("djset-viz-favs", n); return n; }); }, []);
    const toggleBlocked = useCallback((k: string) => { setBlocked((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); saveSet("djset-viz-blocked", n); return n; }); }, []);

    // ── Load Butterchurn + presets once ────────────────────
    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                const [bcMod, presetsMod] = await Promise.all([
                    import("butterchurn"),
                    import("butterchurn-presets"),
                ]);
                if (cancelled) return;

                // butterchurn CJS: module.exports = Butterchurn (class with static createVisualizer)
                // Dynamic ESM import wraps CJS as { default: Butterchurn }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const ButterchurnClass = (bcMod as any).default as {
                    createVisualizer: (a: AudioContext | null, c: HTMLCanvasElement, o: Record<string, unknown>) => BcVisualizer;
                };
                // butterchurn-presets CJS: exports a class with static getPresets()
                // Dynamic ESM import wraps CJS as { default: PresetsClass }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const PresetsClass = (presetsMod as any).default as { getPresets: () => Record<string, object> };
                const presets = PresetsClass.getPresets();
                presetMapRef.current = presets;
                presetKeysRef.current = Object.keys(presets);

                const canvas = canvasRef.current;
                if (!canvas) return;

                // Set canvas pixel buffer BEFORE creating Butterchurn.
                // BC grabs canvas.getContext('2d') as its output target;
                // changing canvas.width/height later would destroy that context.
                const dpr = window.devicePixelRatio || 1;
                const pw = Math.max(1, Math.round(canvas.clientWidth * dpr));
                const ph = Math.max(1, Math.round(canvas.clientHeight * dpr));
                canvas.width = pw;
                canvas.height = ph;

                const audioCtx = new AudioContext();
                audioCtxRef.current = audioCtx;

                // Silent gain node — Butterchurn analyzes audio; user hears Spotify
                const gain = audioCtx.createGain();
                gain.gain.value = 0;
                gain.connect(audioCtx.destination);
                gainRef.current = gain;

                const viz = ButterchurnClass.createVisualizer(audioCtx, canvas, {
                    width: pw,
                    height: ph,
                    pixelRatio: dpr,
                    textureRatio: 1,
                });
                bcRef.current = viz;

                // Load first preset immediately
                const keys = presetKeysRef.current;
                if (keys.length) {
                    presetIdxRef.current = 1;
                    activeKeyRef.current = keys[0];
                    viz.loadPreset(presets[keys[0]], 0);
                    showFlash("▶ " + keys[0].substring(0, 45));
                }

                setUseBc(true);
            } catch (err) {
                console.warn("Butterchurn init failed, using Canvas 2D fallback:", err);
                if (!cancelled) setUseBc(false);
            }
        }

        init();
        return () => { cancelled = true; };
    }, []);

    // ── When track changes: fetch audio, decode, feed BC ──
    useEffect(() => {
        if (!useBc || !now?.id) return;

        const viz = bcRef.current;
        const ctx = audioCtxRef.current;
        const gain = gainRef.current;
        if (!viz || !ctx || !gain) return;

        let cancelled = false;

        async function loadAndPlay() {
            try { sourceRef.current?.stop(); } catch { /* */ }
            sourceRef.current = null;

            if (ctx!.state === "suspended") await ctx!.resume();

            try {
                const resp = await fetch(`${API_BASE}/api/audio/${now!.id}`);
                if (!resp.ok) throw new Error(`audio fetch failed: ${resp.status}`);
                const buf = await resp.arrayBuffer();
                if (cancelled) return;

                const audioBuf = await ctx!.decodeAudioData(buf);
                if (cancelled) return;

                const source = ctx!.createBufferSource();
                source.buffer = audioBuf;
                source.connect(gain!);        // muted → speakers
                viz!.connectAudio(source);    // raw signal → Butterchurn FFT

                // Start from 0 — the cached audio may have different timing
                // than Spotify's stream. The visualizer just reacts to energy.
                source.start(0);
                sourceRef.current = source;

                // Only auto-cycle if user hasn't manually picked a preset
                if (!manualRef.current) {
                    const presets = presetMapRef.current;
                    const keys = presetKeysRef.current;
                    if (presets && keys.length) {
                        const idx = presetIdxRef.current % keys.length;
                        presetIdxRef.current = idx + 1;
                        activeKeyRef.current = keys[idx];
                        viz!.loadPreset(presets[keys[idx]], 0.15);
                    }
                }
                // Reset manual flag for next track: user can re-lock by clicking again
                manualRef.current = false;
            } catch (err) {
                console.warn("Butterchurn audio load failed:", err);
                if (!cancelled) showFlash("no audio — idling");
            }
        }

        loadAndPlay();
        return () => { cancelled = true; };
    }, [now?.id, useBc]);

    // ── Render loop ────────────────────────────────────────
    useEffect(() => {
        if (!useBc) return;

        let running = true;
        const draw = () => {
            if (!running) return;
            try {
                bcRef.current?.render();
            } catch (e) {
                console.warn("Butterchurn render error:", e);
            }

            // Overlay via DOM (never touches canvas 2D context)
            const flash = flashRef.current;
            const ov = overlayRef.current;
            const t = performance.now();
            if (ov) {
                ov.style.opacity = t < flash.until ? String(Math.min(1, (flash.until - t) / 500)) : "0";
                if (t < flash.until) ov.textContent = flash.text;
            }

            rafRef.current = requestAnimationFrame(draw);
        };
        rafRef.current = requestAnimationFrame(draw);

        const onVis = () => {
            if (document.hidden) cancelAnimationFrame(rafRef.current);
            else if (running) rafRef.current = requestAnimationFrame(draw);
        };
        document.addEventListener("visibilitychange", onVis);

        return () => {
            running = false;
            cancelAnimationFrame(rafRef.current);
            document.removeEventListener("visibilitychange", onVis);
        };
    }, [useBc]);

    // ── Canvas resize → update BC renderer internal size ──
    // NOTE: do NOT set canvas.width/height here — that would
    // destroy Butterchurn's output 2D context.
    useEffect(() => {
        if (!useBc) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const sync = () => {
            const dpr = window.devicePixelRatio || 1;
            bcRef.current?.setRendererSize(
                Math.round(canvas.clientWidth * dpr),
                Math.round(canvas.clientHeight * dpr),
            );
        };

        sync();
        const ro = new ResizeObserver(sync);
        ro.observe(canvas);
        return () => ro.disconnect();
    }, [useBc]);

    // ── Click: cycle to next preset ───────────────────────
    const cyclePreset = useCallback(() => {
        const presets = presetMapRef.current;
        const keys = presetKeysRef.current;
        if (!presets || !keys.length) return;
        const idx = presetIdxRef.current % keys.length;
        const key = keys[idx];
        presetIdxRef.current = idx + 1;
        activeKeyRef.current = key;
        manualRef.current = true;
        bcRef.current?.loadPreset(presets[key], 0.15);
        showFlash(key.substring(0, 50));
    }, []);

    // ── Select specific preset (context menu) ─────────────
    const selectPreset = useCallback((key: string) => {
        const presets = presetMapRef.current;
        if (!presets || !presets[key]) return;
        activeKeyRef.current = key;
        manualRef.current = true;
        bcRef.current?.loadPreset(presets[key], 0.15);
        showFlash(key.substring(0, 50));
        setCtxMenu(null);
    }, []);

    // ── Right-click: open context menu ────────────────────
    const onContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation(); // prevent the same event from closing the menu
        setCtxMenu({ x: e.clientX, y: e.clientY });
    }, []);

    // Close context menu on any outside interaction, but NOT on
    // clicks inside the menu itself (those go through our buttons).
    useEffect(() => {
        if (!ctxMenu) return;
        const close = (e: Event) => {
            // Ignore events whose target is inside the context menu
            const el = e.target as HTMLElement | null;
            if (el?.closest("[data-viz-menu]")) return;
            setCtxMenu(null);
        };
        const opts = { capture: true } as const;
        window.addEventListener("pointerdown", close, opts);
        return () => window.removeEventListener("pointerdown", close, opts);
    }, [ctxMenu]);

    function showFlash(text: string) {
        flashRef.current = { text, until: performance.now() + 2200 };
    }

    // ── Unmount cleanup ───────────────────────────────────
    useEffect(() => {
        return () => {
            cancelAnimationFrame(rafRef.current);
            try { sourceRef.current?.stop(); } catch { /* */ }
            audioCtxRef.current?.close();
        };
    }, []);

    // ── Loading ───────────────────────────────────────────
    if (useBc === null) {
        return <canvas ref={canvasRef} className="absolute inset-0 size-full" />;
    }

    // ── Butterchurn ───────────────────────────────────────
    if (useBc) {
        const allKeys = presetKeysRef.current;

        // Filter + sort: blocked hidden, favs first, search filter
        const s = search.toLowerCase().trim();
        const visibleKeys = allKeys
            .filter((k) => !blocked.has(k))
            .filter((k) => !s || k.toLowerCase().includes(s))
            .sort((a, b) => (favs.has(b) ? 1 : 0) - (favs.has(a) ? 1 : 0));

        return (
            <>
                <canvas
                    ref={canvasRef}
                    onClick={cyclePreset}
                    onContextMenu={onContextMenu}
                    className="absolute inset-0 size-full cursor-pointer"
                />
                {/* Block current preset — bottom-left float */}
                <button
                    onClick={() => { const k = activeKeyRef.current; if (k) toggleBlocked(k); }}
                    title={activeKeyRef.current && blocked.has(activeKeyRef.current)
                        ? "Unblock this preset"
                        : "Block this preset (hide from list)"}
                    className="absolute bottom-3 left-3 z-20 rounded-md bg-black/50 px-2 py-1 text-[11px] text-white/30 transition-opacity hover:bg-black/70 hover:text-white/90 hover:opacity-100"
                >
                    {activeKeyRef.current && blocked.has(activeKeyRef.current) ? "🚫 Blocked" : "🚫 Block"}
                </button>
                <div
                    ref={overlayRef}
                    className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-black/70 px-4 py-1.5 text-center text-sm text-white opacity-0 transition-opacity"
                />
                {/* Context menu */}
                {ctxMenu && (
                    <div
                        className="fixed inset-0 z-50"
                        onClick={() => setCtxMenu(null)}
                    >
                        <div
                            data-viz-menu
                            className="absolute flex max-h-80 w-80 flex-col rounded-lg border border-border bg-card shadow-xl"
                            style={{ left: ctxMenu.x, top: ctxMenu.y }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Search */}
                            <div className="shrink-0 border-b border-border p-2">
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search presets…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                                />
                            </div>
                            {/* Header */}
                            <div className="shrink-0 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                {s ? `${visibleKeys.length} matches` : `Presets · ${allKeys.length - blocked.size} shown`}
                                {blocked.size > 0 && <span className="ml-1 opacity-60">({blocked.size} hidden)</span>}
                            </div>
                            {/* List */}
                            <div className="flex-1 overflow-y-auto pb-1">
                                {visibleKeys.length === 0 && (
                                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                                        {s ? "No matches" : "All blocked or loading…"}
                                    </div>
                                )}
                                {visibleKeys.map((key) => (
                                    <div key={key} className="group flex items-center gap-0.5 pr-1">
                                        <button
                                            onMouseDown={(e) => { e.preventDefault(); selectPreset(key); }}
                                            className="flex-1 truncate rounded px-3 py-1 text-left text-xs text-foreground transition-colors hover:bg-accent"
                                            title={key}
                                        >
                                            {favs.has(key) && <span className="mr-1">⭐</span>}
                                            {key.substring(0, 55)}
                                        </button>
                                        <button
                                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(key); }}
                                            title={favs.has(key) ? "Remove favorite" : "Add favorite"}
                                            className="shrink-0 rounded p-0.5 text-xs opacity-30 transition-opacity hover:opacity-100 group-hover:opacity-60"
                                        >
                                            {favs.has(key) ? "⭐" : "☆"}
                                        </button>
                                        <button
                                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleBlocked(key); }}
                                            title={blocked.has(key) ? "Unblock" : "Block"}
                                            className="shrink-0 rounded p-0.5 text-xs opacity-30 transition-opacity hover:opacity-100 group-hover:opacity-60"
                                        >
                                            {blocked.has(key) ? "🚫" : "✕"}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }

    // ── Fallback ──────────────────────────────────────────
    return <FallbackViz now={now} canvasRef={canvasRef} />;
}

// ──────────────────────────────────────────────────────────
// Fallback Canvas 2D visualizer
// ──────────────────────────────────────────────────────────
interface Particle {
    x: number; y: number; vx: number; vy: number;
    life: number; maxLife: number; size: number; hue: number;
}

function FallbackViz({
    now,
    canvasRef: extRef,
}: {
    now: NowPlaying | null;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
    const clockRef = useRef({ id: "", progress: 0, at: 0, playing: false, duration: 0 });
    const modeRef = useRef<FallbackMode>("fire");
    const particlesRef = useRef<Particle[]>([]);
    const rafRef = useRef(0);
    const flashRef = useRef({ text: "", until: 0 });
    const ampRef = useRef(0);

    const waveform = now?.curves?.waveform ?? [];

    useEffect(() => {
        const c = clockRef.current;
        const server = now?.progress_ms ?? 0;
        const playing = now?.is_playing ?? false;
        const id = now?.id ?? "";
        const local = c.playing ? c.progress + (performance.now() - c.at) : c.progress;
        if (c.id !== id || c.playing !== playing || Math.abs(server - local) > 1200) {
            clockRef.current = { id, progress: server, at: performance.now(), playing, duration: now?.duration_ms ?? 0 };
        } else {
            clockRef.current.duration = now?.duration_ms ?? 0;
        }
    }, [now?.id, now?.progress_ms, now?.is_playing, now?.duration_ms]);

    const getAmp = useCallback(() => {
        const c = clockRef.current;
        const pos = c.playing ? c.progress + (performance.now() - c.at) : c.progress;
        const frac = c.duration ? pos / c.duration : 0;
        const idx = Math.floor(frac * (waveform.length - 1));
        return waveform[Math.max(0, Math.min(idx, waveform.length - 1))] || 0;
    }, [waveform]);

    const smoothAmp = useCallback(() => {
        const raw = getAmp();
        ampRef.current = ampRef.current * 0.82 + raw * 0.18;
        return ampRef.current;
    }, [getAmp]);

    const spawnFire = useCallback((w: number, h: number, amp: number) => {
        const ps = particlesRef.current;
        const intensity = Math.min(1, amp * 2.5);
        const count = Math.floor(8 + intensity * 18);
        for (let i = 0; i < count; i++) {
            if (ps.length >= 500) break;
            ps.push({
                x: w * (0.5 + (Math.random() - 0.5) * 0.3), y: h - 4,
                vx: (Math.random() - 0.5) * 0.8, vy: -(1.2 + intensity * 2.8 + Math.random() * 1.5),
                life: 40 + Math.random() * 50, maxLife: 40 + Math.random() * 50,
                size: 2 + Math.random() * 5 * intensity, hue: 40 + Math.random() * 22,
            });
        }
    }, []);

    const drawFire = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, amp: number) => {
        const ps = particlesRef.current;
        for (let i = ps.length - 1; i >= 0; i--) {
            const p = ps[i];
            p.x += p.vx + (Math.random() - 0.5) * 0.4; p.y += p.vy; p.vy *= 0.998; p.vy -= 0.008; p.life--;
            if (p.life <= 0 || p.y < -20 || p.x < -20 || p.x > w + 20) { ps.splice(i, 1); continue; }
            const t = p.life / p.maxLife;
            ctx.globalAlpha = Math.min(1, t * 2);
            ctx.fillStyle = `hsl(${15 + t * 50}, 90%, ${30 + t * 55}%)`;
            if (t > 0.7) { ctx.shadowColor = `hsl(${15 + t * 50}, 95%, 55%)`; ctx.shadowBlur = p.size * 2.5; }
            else ctx.shadowBlur = 0;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + t * 0.5), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        const glowH = 40 + amp * 160;
        const glow = ctx.createLinearGradient(w / 2, h, w / 2, h - glowH);
        glow.addColorStop(0, `hsla(30, 100%, 50%, ${0.25 + amp * 0.35})`);
        glow.addColorStop(0.4, `hsla(15, 100%, 45%, ${0.15 + amp * 0.2})`);
        glow.addColorStop(1, "hsla(0, 0%, 5%, 0)");
        ctx.fillStyle = glow; ctx.fillRect(w / 2 - 60 - amp * 40, h - glowH, 120 + amp * 80, glowH);
        for (let i = 0; i < Math.floor(amp * 6); i++) {
            ctx.fillStyle = `hsla(${25 + Math.random() * 20}, 95%, ${65 + Math.random() * 20}%, ${0.3 + Math.random() * 0.5})`;
            ctx.beginPath(); ctx.arc(w / 2 + (Math.random() - 0.5) * 200, h - Math.random() * glowH * 1.2, 1 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
        }
    }, []);

    const drawBars = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
        const BAR_COUNT = 48, gap = 2, barW = (w - gap * (BAR_COUNT + 1)) / BAR_COUNT;
        const peaks = waveform;
        const bins: number[] = new Array(BAR_COUNT).fill(0);
        for (let i = 0; i < peaks.length; i++) bins[Math.floor((i / peaks.length) * BAR_COUNT)] = Math.max(bins[Math.floor((i / peaks.length) * BAR_COUNT)], peaks[i]);
        const maxBin = Math.max(...bins, 0.001);
        for (let i = 0; i < BAR_COUNT; i++) {
            const norm = bins[i] / maxBin, barH = 4 + norm * (h - 16);
            const x = gap + i * (barW + gap), y = (h - barH) / 2;
            const hue = 220 + (i / BAR_COUNT) * 200, light = 45 + norm * 25;
            const grad = ctx.createLinearGradient(x, y, x, y + barH);
            grad.addColorStop(0, `hsl(${hue}, 90%, ${light + 15}%)`);
            grad.addColorStop(0.5, `hsl(${hue}, 85%, ${light}%)`);
            grad.addColorStop(1, `hsl(${hue}, 80%, ${light - 10}%)`);
            ctx.fillStyle = grad; ctx.fillRect(x, y, barW, barH);
            if (norm > 0.3) { ctx.fillStyle = `hsla(${hue}, 95%, 80%, ${norm * 0.4})`; ctx.fillRect(x, y - 2, barW, 4); }
        }
    }, [waveform]);

    const drawWave = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
        const peaks = waveform;
        if (!peaks.length) return;
        const mid = h / 2, amp = h * 0.42;
        ctx.beginPath();
        for (let i = 0; i < peaks.length; i++) { const x = (i / (peaks.length - 1)) * w; const y = mid - peaks[i] * amp; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.strokeStyle = "hsla(160, 70%, 55%, 0.15)"; ctx.lineWidth = 10; ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < peaks.length; i++) { const x = (i / (peaks.length - 1)) * w; const y = mid - peaks[i] * amp; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        const wg = ctx.createLinearGradient(0, mid - amp, 0, mid + amp);
        wg.addColorStop(0, "hsl(160, 90%, 65%)"); wg.addColorStop(0.5, "hsl(160, 80%, 50%)"); wg.addColorStop(1, "hsl(160, 90%, 35%)");
        ctx.strokeStyle = wg; ctx.lineWidth = 2.2;
        ctx.shadowColor = "hsla(160, 90%, 55%, 0.7)"; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
        ctx.beginPath();
        for (let i = 0; i < peaks.length; i++) { const x = (i / (peaks.length - 1)) * w; const y = mid + peaks[i] * amp; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.strokeStyle = "hsla(160, 60%, 50%, 0.2)"; ctx.lineWidth = 1; ctx.stroke();
    }, [waveform]);

    const cycleMode = useCallback(() => {
        const modes: FallbackMode[] = ["fire", "bars", "wave"];
        const idx = modes.indexOf(modeRef.current);
        modeRef.current = modes[(idx + 1) % modes.length];
        flashRef.current = { text: FALLBACK_LABELS[modeRef.current], until: performance.now() + 1500 };
    }, []);

    useEffect(() => {
        let running = true;
        const draw = () => {
            if (!running) return;
            const canvas = extRef.current;
            if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
            const ctx = canvas.getContext("2d");
            if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }
            const w = canvas.clientWidth, h = canvas.clientHeight;
            const dpr = window.devicePixelRatio || 1;
            if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
            ctx.clearRect(0, 0, w, h);
            const c = clockRef.current, playing = c.playing, amp = smoothAmp();
            if (modeRef.current === "fire" && playing) spawnFire(w, h, amp);
            else if (modeRef.current === "fire" && !playing) {
                const ps = particlesRef.current;
                for (let i = ps.length - 1; i >= 0; i--) { ps[i].life -= 2; ps[i].vy += 0.02; if (ps[i].life <= 0) ps.splice(i, 1); }
            }
            switch (modeRef.current) {
                case "fire": drawFire(ctx, w, h, playing ? amp : 0.05); break;
                case "bars": drawBars(ctx, w, h); break;
                case "wave": drawWave(ctx, w, h); break;
            }
            const f = flashRef.current, t = performance.now();
            if (t < f.until) {
                const fade = Math.min(1, (f.until - t) / 400);
                ctx.fillStyle = `hsla(0, 0%, 100%, ${fade * 0.85})`;
                ctx.font = "14px var(--font-geist-sans), sans-serif"; ctx.textAlign = "center";
                ctx.fillText(f.text, w / 2, h - 24);
            }
            rafRef.current = requestAnimationFrame(draw);
        };
        rafRef.current = requestAnimationFrame(draw);
        const onVis = () => { if (document.hidden) cancelAnimationFrame(rafRef.current); else if (running) rafRef.current = requestAnimationFrame(draw); };
        document.addEventListener("visibilitychange", onVis);
        return () => { running = false; cancelAnimationFrame(rafRef.current); document.removeEventListener("visibilitychange", onVis); };
    }, [drawFire, drawBars, drawWave, spawnFire, smoothAmp, extRef]);

    return <canvas ref={extRef} onClick={cycleMode} className="absolute inset-0 size-full cursor-pointer" />;
}
