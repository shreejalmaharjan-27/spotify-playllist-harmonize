"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Disc3, Library, Radio, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLive } from "@/lib/useSocket";

const NAV = [
  { href: "/", label: "Now Playing", icon: Radio },
  { href: "/library", label: "Library", icon: Library },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { connected } = useLive();
  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 border-r bg-card/40 p-3">
      <div className="flex items-center gap-2 px-2 py-3">
        <Disc3 className="size-5 text-primary" />
        <span className="font-semibold tracking-tight">DJ Set</span>
        <span
          className={cn(
            "ml-auto size-2 rounded-full",
            connected ? "bg-primary" : "bg-muted-foreground/40",
          )}
          title={connected ? "live" : "offline"}
        />
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50",
                active && "bg-accent text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <p className="mt-auto px-3 text-xs text-muted-foreground/70">
        Turn on Spotify Crossfade (~10s) for seamless blends.
      </p>
    </aside>
  );
}
