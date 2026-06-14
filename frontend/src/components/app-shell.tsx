"use client";

import { type ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useVisualizer } from "@/lib/visualizer-context";

export function AppShell({ children }: { children: ReactNode }) {
    const { vizMode } = useVisualizer();

    return (
        <div className="flex h-screen overflow-hidden">
            <div
                className="shrink-0 overflow-hidden transition-all duration-300"
                style={{ width: vizMode ? 0 : undefined }}
            >
                <div className="w-56">
                    <Sidebar />
                </div>
            </div>
            <main className="flex-1 overflow-y-auto">{children}</main>
            <Toaster position="bottom-right" />
        </div>
    );
}
