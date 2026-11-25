/**
 * データ層の窓口。Supabase の設定があれば Supabase、なければデモ（端末のブラウザ内だけで動作）。
 * 画面側はこのインターフェースだけを使う。
 */
import type { Launch, Level, LiveState, LngLat, LogEntry, Me, Mode, Report, Role, StaffMember } from "@/lib/types";

export type Unsubscribe = () => void;

export interface Backend {
  isDemo: boolean;

  // ---- ログイン ----
  /** 現在のログイン状態を通知（初回も呼ぶ） */
  onMe(cb: (me: Me | null) => void): Unsubscribe;
  sendMagicLink(email: string): Promise<void>;
  /** デモのみ: 名前と権限を選んでログイン */
  demoSignIn?(name: string, role: Role): Promise<void>;
  signOut(): Promise<void>;

  // ---- 一般向け（入力者名なし。定期取得） ----
  fetchPublic(): Promise<LiveState>;

  // ---- 職員向け（入力者名あり。リアルタイム） ----
  subscribeLive(cb: (live: LiveState) => void, onError?: (e: Error) => void): Unsubscribe;
  subscribeReports(cb: (reports: Report[]) => void): Unsubscribe;
  /** 最新50件。変更があるたびに再通知 */
  subscribeLogs(cb: (logs: LogEntry[]) => void): Unsubscribe;

  setSpotLevel(spotId: string, level: Level): Promise<void>;
  setRoadLevel(roadId: string, dir: number, level: Level): Promise<void>;
  /** 空文字で消去 */
  setNotice(text: string): Promise<void>;
  /** オーナーのみ */
  setMode(mode: Mode): Promise<void>;
  /** オーナーのみ */
  setLaunch(launch: Launch): Promise<void>;
  addReport(text: string, coords: LngLat | null): Promise<void>;
  resolveReport(id: string): Promise<void>;

  // ---- 職員管理（オーナーのみ） ----
  listStaff(): Promise<StaffMember[]>;
  upsertStaff(member: StaffMember): Promise<void>;
  removeStaff(email: string): Promise<void>;

  // ---- デモのみ ----
  demoSeed?(): Promise<void>;
  demoReset?(): Promise<void>;
}

export const NOTICE_MAX = 500;
export const REPORT_MAX = 300;

let instance: Promise<Backend> | null = null;

export function hasSupabase(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getBackend(): Promise<Backend> {
  if (!instance) {
    instance = hasSupabase()
      ? import("@/lib/backend-supabase").then((m) => m.createSupabaseBackend())
      : import("@/lib/backend-demo").then((m) => m.createDemoBackend());
  }
  return instance;
}

export function checkReportText(text: string): string {
  const t = text.trim();
  if (!t) throw new Error("内容を入力してください");
  if (t.length > REPORT_MAX) throw new Error(`${REPORT_MAX}文字以内にしてください`);
  return t;
}

export function checkNoticeText(text: string): string {
  const t = text.trim();
  if (t.length > NOTICE_MAX) throw new Error(`${NOTICE_MAX}文字以内にしてください`);
  return t;
}

/** 外部から受け取った状況データを型どおりに整える（不正な値は捨てる） */
export function normalizeLive(raw: unknown): LiveState {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const entries = (src: unknown): LiveState["spots"] => {
    const out: LiveState["spots"] = {};
    if (src && typeof src === "object") {
      for (const [k, v] of Object.entries(src as Record<string, any>)) {
        if (v && Number.isInteger(v.level) && v.level >= 0 && v.level <= 3 && Number.isFinite(v.at)) {
          out[k] = { level: v.level, at: v.at, ...(typeof v.by === "string" ? { by: v.by } : {}) };
        }
      }
    }
    return out;
  };
  const l = d.launch ?? {};
  const states = ["scheduled", "countdown", "delayed", "scrubbed", "launched"];
  return {
    mode: d.mode === "launch" ? "launch" : "normal",
    launch: {
      state: states.includes(l.state) ? l.state : "scheduled",
      time: typeof l.time === "string" ? l.time : "",
      note: typeof l.note === "string" ? l.note : "",
    },
    notice:
      d.notice && typeof d.notice.text === "string" && d.notice.text
        ? { text: d.notice.text, at: Number(d.notice.at) || 0 }
        : null,
    spots: entries(d.spots),
    roads: entries(d.roads),
    updatedAt: Number(d.updatedAt) || 0,
  };
}

/** 一般向けには入力者名を含めない */
export function toPublic(l: LiveState): LiveState {
  const strip = (src: LiveState["spots"]) =>
    Object.fromEntries(Object.entries(src).map(([k, v]) => [k, { level: v.level, at: v.at }]));
  return {
    mode: l.mode,
    launch: l.launch,
    notice: l.notice ? { text: l.notice.text, at: l.notice.at } : null,
    spots: strip(l.spots),
    roads: strip(l.roads),
    updatedAt: l.updatedAt,
  };
}
