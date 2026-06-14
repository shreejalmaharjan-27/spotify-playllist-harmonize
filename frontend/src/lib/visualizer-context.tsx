"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "djset-viz-mode";

interface VisualizerCtx {
    vizMode: boolean;
    toggleVizMode: () => void;
}

const Ctx = createContext<VisualizerCtx>({ vizMode: false, toggleVizMode: () => { } });

export function VisualizerProvider({ children }: { children: ReactNode }) {
    const [vizMode, setVizMode] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Hydrate from localStorage on mount (avoids SSR mismatch)
    useEffect(() => {
        try {
            setVizMode(localStorage.getItem(STORAGE_KEY) === "1");
        } catch {
            // localStorage unavailable (e.g. private browsing)
        }
        setMounted(true);
    }, []);

    const toggleVizMode = useCallback(() => {
        setVizMode((v) => {
            const next = !v;
            try {
                localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
            } catch {
                // ignore
            }
            return next;
        });
    }, []);

    // Before mount, return default (false) — avoids layout flash
    if (!mounted) return <Ctx.Provider value={{ vizMode: false, toggleVizMode }}>{children}</Ctx.Provider>;

    return <Ctx.Provider value={{ vizMode, toggleVizMode }}>{children}</Ctx.Provider>;
}

export function useVisualizer() {
    return useContext(Ctx);
}
