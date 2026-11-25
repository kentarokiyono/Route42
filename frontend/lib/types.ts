/** 混雑度 0〜3（スポット: 空き/普通/やや混雑/混雑・満員、道路: 順調/混雑/渋滞/通行止め） */
export type Level = 0 | 1 | 2 | 3;
export type Mode = "normal" | "launch";
export type LaunchState = "scheduled" | "countdown" | "delayed" | "scrubbed" | "launched";
export type Role = "owner" | "staff";
export type LngLat = [number, number];

export interface Entry {
  level: Level;
  /** 更新時刻（ミリ秒） */
  at: number;
  /** 入力者名（職員向けデータのみ） */
  by?: string;
}

export interface Launch {
  state: LaunchState;
  /** "2026-12-03T11:00"（日本時間の入力値をそのまま保存） */
  time: string;
  note: string;
}

export interface Notice {
  text: string;
  at: number;
  by?: string;
}

/** 混雑・打ち上げの状況。職員向けは by あり、一般向けは by なし */
export interface LiveState {
  mode: Mode;
  launch: Launch;
  notice: Notice | null;
  spots: Record<string, Entry>;
  roads: Record<string, Entry>;
  updatedAt: number;
}

export interface Report {
  id: string;
  text: string;
  coords: LngLat | null;
  by: string;
  at: number;
}

export interface LogEntry {
  id: string;
  at: number;
  actor: string;
  action: "level" | "road" | "notice" | "mode" | "launch" | "report" | "resolve" | string;
  target: string;
  value: string;
}

export interface Me {
  email: string;
  name: string;
  /** null = ログイン済みだが職員として登録されていない */
  role: Role | null;
}

export interface StaffMember {
  email: string;
  name: string;
  role: Role;
}

export function emptyLive(): LiveState {
  return {
    mode: "normal",
    launch: { state: "scheduled", time: "", note: "" },
    notice: null,
    spots: {},
    roads: {},
    updatedAt: 0,
  };
}
