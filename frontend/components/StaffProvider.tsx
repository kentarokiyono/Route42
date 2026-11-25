"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Backend } from "@/lib/backend";
import { emptyLive, type LiveState, type LogEntry, type Me, type Report } from "@/lib/types";

interface StaffData {
  backend: Backend;
  me: Me;
  isOwner: boolean;
  live: LiveState;
  /** 最初のデータを受け取ったか */
  loaded: boolean;
  /** リアルタイム接続の失敗 */
  liveError: string | null;
  reports: Report[];
  logs: LogEntry[];
}

const Ctx = createContext<StaffData | null>(null);

/** 職員画面で共有するデータ。購読は1本にまとめる */
export function StaffProvider({ backend, me, children }: { backend: Backend; me: Me; children: React.ReactNode }) {
  const [live, setLive] = useState<LiveState>(emptyLive);
  const [loaded, setLoaded] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const offs = [
      backend.subscribeLive(
        (l) => {
          setLive(l);
          setLoaded(true);
          setLiveError(null);
        },
        (e) => setLiveError(e.message)
      ),
      backend.subscribeReports(setReports),
      backend.subscribeLogs(setLogs),
    ];
    return () => offs.forEach((off) => off());
  }, [backend]);

  return (
    <Ctx.Provider value={{ backend, me, isOwner: me.role === "owner", live, loaded, liveError, reports, logs }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStaff(): StaffData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStaff は StaffProvider の内側で使ってください");
  return v;
}
