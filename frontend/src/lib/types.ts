export type TrackStatus = "analyzed" | "downloaded" | "missing" | "not_in_library";

export interface Track {
  pos: number;
  id: string;
  uri: string;
  name: string;
  artists: string;
  camelot: string;
  key_name: string;
  bpm: number;
  energy: number;
  groove: number;
  transition: string;
  album_art?: string | null;
}

export interface Curves {
  energy_curve?: number[];
  waveform?: number[];
}

export interface NowPlaying {
  uri: string;
  id: string;
  name: string;
  artists: string;
  album_art: string | null;
  progress_ms: number;
  duration_ms: number;
  is_playing: boolean;
  // present only when the track has local analysis
  camelot?: string;
  bpm?: number;
  energy?: number;
  key_name?: string;
  transition?: string;
  curves?: Curves;
}

export interface Playlist {
  id: string;
  name: string;
  count: number;
  image: string | null;
  owner: string;
}

export interface CoverageTrack {
  id: string;
  name: string;
  artists: string;
  status: TrackStatus;
}

export interface Coverage {
  total: number;
  downloaded: number;
  analyzed: number;
  tracks: CoverageTrack[];
}

export interface JobState {
  job: "download" | "analyze" | null;
  status: "idle" | "running" | "done" | "error";
  done: number;
  total: number;
  message: string;
}

// WebSocket frames
export interface SetMsg {
  type: "set";
  count: number;
  compatible_pct: number;
  target_curve: number[];
  actual_curve: number[];
  tracks: Track[];
  missing: number;
}
export interface NowMsg {
  type: "now";
  now: NowPlaying | null;
  pos: number | null;
  error: string | null;
}
export interface JobMsg extends JobState {
  type: "job";
}
export type WsMsg = SetMsg | NowMsg | JobMsg;
