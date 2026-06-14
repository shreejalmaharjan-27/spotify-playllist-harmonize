import type { Coverage, JobState, Playlist } from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(API_BASE + path, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function post<T>(path: string): Promise<T> {
  const r = await fetch(API_BASE + path, { method: "POST" });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export const api = {
  authStatus: () => get<{ authenticated: boolean }>("/api/auth/status"),
  loginUrl: () => `${API_BASE}/auth/login`,

  playlists: () => get<{ playlists: Playlist[] }>("/api/playlists"),
  selectPlaylist: (id: string) =>
    post<{ ok?: boolean; error?: string; ordered?: number; missing?: number; compatible_pct?: number }>(
      `/api/select/${id}`,
    ),

  control: (action: "play" | "pause" | "skip" | "prev") =>
    post<{ ok?: boolean; error?: string }>(`/api/control/${action}`),

  playAt: (pos: number) =>
    post<{ ok?: boolean; error?: string }>(`/api/play_at/${pos}`),

  coverage: (playlistId?: string) =>
    get<Coverage>(`/api/coverage${playlistId ? `?playlist_id=${playlistId}` : ""}`),

  jobStatus: () => get<JobState>("/api/jobs/status"),
  startJob: (
    job: "download" | "analyze",
    scope: "all" | "playlist" = "all",
    playlistId?: string,
  ) =>
    post<JobState & { error?: string }>(
      `/api/jobs/${job}?scope=${scope}${playlistId ? `&playlist_id=${playlistId}` : ""}`,
    ),
};
