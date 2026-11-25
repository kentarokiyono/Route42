"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBackend, type Backend } from "@/lib/backend";
import { emptyLive, type LiveState, type Me } from "@/lib/types";

export function useBackend(): Backend | null {
  const [b, setB] = useState<Backend | null>(null);
  useEffect(() => {
    let alive = true;
    getBackend().then((x) => alive && setB(x));
    return () => {
      alive = false;
    };
  }, []);
  return b;
}

/** ログイン状態。ready=false の間は確認中 */
export function useMe(backend: Backend | null): { me: Me | null; ready: boolean } {
  const [state, setState] = useState<{ me: Me | null; ready: boolean }>({ me: null, ready: false });
  useEffect(() => {
    if (!backend) return;
    return backend.onMe((me) => setState({ me, ready: true }));
  }, [backend]);
  return state;
}

/** 一定間隔で再描画（情報の鮮度表示のため） */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const PUBLIC_CACHE = "route42.public.last";

/**
 * 一般向けの状況を定期取得する。電波が弱い現地のため、最後に取得できた内容を端末に残して表示する。
 * error が true のとき data は前回取得分（fetchedAt の時点）。
 */
export function usePublicStatus(intervalMs = 60_000) {
  const backend = useBackend();
  const [data, setData] = useState<LiveState | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem(PUBLIC_CACHE) || "null");
      if (c?.data) {
        setData({ ...emptyLive(), ...c.data });
        setFetchedAt(c.at || 0);
      }
    } catch {
      // 端末に保存できない環境
    }
  }, []);

  const load = useCallback(async () => {
    if (!backend) return;
    if (timer.current) clearTimeout(timer.current);
    try {
      const d = await backend.fetchPublic();
      const at = Date.now();
      setData(d);
      setFetchedAt(at);
      setError(false);
      try {
        localStorage.setItem(PUBLIC_CACHE, JSON.stringify({ data: d, at }));
      } catch {
        // noop
      }
    } catch {
      setError(true);
    }
    timer.current = setTimeout(load, backend.isDemo ? 5000 : intervalMs);
  }, [backend, intervalMs]);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  return { data, fetchedAt, error, reload: load, isDemo: backend?.isDemo ?? false };
}
