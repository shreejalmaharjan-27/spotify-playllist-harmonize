"use client";

import { useEffect, useState } from "react";
import { WS_URL } from "./api";
import type { JobState, NowMsg, SetMsg, Track, WsMsg } from "./types";

// A single shared WebSocket for the whole app. Components subscribe to slices.
interface LiveState {
  connected: boolean;
  now: NowMsg | null;
  set: SetMsg | null;
  job: JobState | null;
}

let socket: WebSocket | null = null;
let state: LiveState = { connected: false, now: null, set: null, job: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function ensureSocket() {
  if (socket || typeof window === "undefined") return;
  const ws = new WebSocket(WS_URL);
  socket = ws;
  ws.onopen = () => {
    state = { ...state, connected: true };
    emit();
  };
  ws.onclose = () => {
    state = { ...state, connected: false };
    socket = null;
    emit();
    setTimeout(ensureSocket, 2000);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as WsMsg;
    if (msg.type === "now") state = { ...state, now: msg };
    else if (msg.type === "set") state = { ...state, set: msg };
    else if (msg.type === "job") state = { ...state, job: msg };
    emit();
  };
}

export function useLive(): LiveState {
  const [snap, setSnap] = useState(state);
  useEffect(() => {
    ensureSocket();
    const update = () => setSnap(state);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return snap;
}

export type { LiveState };
export type { Track };
