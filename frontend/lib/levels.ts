import type { Tone } from "@/lib/palette";
import type { Entry, LaunchState, Level, LiveState } from "@/lib/types";
import { ROADS, roadKey, type Road } from "@/lib/spots";

export interface LevelDef {
  label: string;
  /** 地図のバッジ用の1文字 */
  short: string;
  /** 一覧・ボタンの淡い配色（wuscp の palette と同じ） */
  tone: Tone;
  /** 地図上の線・バッジ（ライト配色の濃い色。地図はダークでも白抜き文字で読める） */
  map: string;
}

export const SPOT_LEVELS: LevelDef[] = [
  { label: "空き", short: "空", tone: "green", map: "#2f7350" },
  { label: "普通", short: "普", tone: "blue", map: "#2c5d8f" },
  { label: "やや混雑", short: "混", tone: "orange", map: "#8f5d1c" },
  { label: "混雑・満員", short: "満", tone: "red", map: "#a33c36" },
];

export const ROAD_LEVELS: LevelDef[] = [
  { label: "順調", short: "順", tone: "green", map: "#2f7350" },
  { label: "混雑", short: "混", tone: "orange", map: "#8f5d1c" },
  { label: "渋滞", short: "渋", tone: "red", map: "#a33c36" },
  { label: "通行止め", short: "止", tone: "purple", map: "#5a4a99" },
];

export const NO_INFO_MAP = "#8e8e93";

export const LAUNCH_LABEL: Record<LaunchState, string> = {
  scheduled: "打ち上げ予定",
  countdown: "カウントダウン中",
  delayed: "延期",
  scrubbed: "中止",
  launched: "打ち上げ済み",
};

export const LAUNCH_ORDER: LaunchState[] = ["scheduled", "countdown", "delayed", "scrubbed", "launched"];
export const isLaunchAlert = (s: LaunchState): boolean => s === "delayed" || s === "scrubbed";

/** この時間より前の入力は「情報なし」扱い */
export const STALE_MIN = 60;

export function isValidLevel(v: unknown): v is Level {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3;
}

/** 新しい情報のみ。古い・未入力は null */
export function freshLevel(e: Entry | undefined, now = Date.now()): Level | null {
  if (!e || !isValidLevel(e.level)) return null;
  if (now - e.at > STALE_MIN * 60 * 1000) return null;
  return e.level;
}

/** 区間の両方向のうち悪い方 */
export function roadWorst(live: LiveState, r: Road, now = Date.now()): Level | null {
  let worst: Level | null = null;
  r.dirs.forEach((_, d) => {
    const lv = freshLevel(live.roads[roadKey(r.id, d)], now);
    if (lv !== null && (worst === null || lv > worst)) worst = lv;
  });
  return worst;
}

/** 集計: 混雑・満員のスポット数、渋滞・通行止めの区間×方向数 */
export function countAlerts(live: LiveState, spotIds: string[], now = Date.now()) {
  const crowded = spotIds.filter((id) => (freshLevel(live.spots[id], now) ?? -1) >= 3).length;
  let jammed = 0;
  ROADS.forEach((r) => r.dirs.forEach((_, d) => {
    if ((freshLevel(live.roads[roadKey(r.id, d)], now) ?? -1) >= 2) jammed++;
  }));
  return { crowded, jammed };
}
