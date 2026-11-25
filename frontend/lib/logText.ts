import { LAUNCH_LABEL, ROAD_LEVELS, SPOT_LEVELS } from "@/lib/levels";
import { parseRoadKey, spotById } from "@/lib/spots";
import type { LaunchState, LogEntry } from "@/lib/types";

/** 入力履歴の1行を文章にする */
export function logText(g: LogEntry): string {
  switch (g.action) {
    case "level":
      return `${spotById(g.target)?.name ?? g.target} → ${SPOT_LEVELS[Number(g.value)]?.label ?? g.value}`;
    case "road": {
      const { road, dir } = parseRoadKey(g.target);
      return `${road ? `${road.name}（${road.dirs[dir]}）` : g.target} → ${ROAD_LEVELS[Number(g.value)]?.label ?? g.value}`;
    }
    case "notice":
      return g.value ? `お知らせ：${g.value}` : "お知らせを消去";
    case "mode":
      return `表示モード → ${g.value === "launch" ? "打ち上げ" : "通常"}`;
    case "launch":
      return `打ち上げ状況 → ${LAUNCH_LABEL[g.target as LaunchState] ?? g.target}${g.value ? ` ${g.value}` : ""}`;
    case "report":
      return `現場報告：${g.value}`;
    case "resolve":
      return `報告を対応済みに${g.value ? `：${g.value}` : ""}`;
    case "staff":
      return g.value === "removed" ? `職員を削除：${g.target}` : `職員を登録：${g.target}`;
    default:
      return g.action;
  }
}
