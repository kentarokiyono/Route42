import type { MapLine, MapPoint } from "@/components/MapView";
import { NO_INFO_MAP, ROAD_LEVELS, SPOT_LEVELS, freshLevel, roadWorst } from "@/lib/levels";
import { ROADS, markOf, roadMid, type Spot } from "@/lib/spots";
import type { LiveState, Report } from "@/lib/types";

export function spotPoints(spots: Spot[], live: LiveState, now: number, opts: { visited?: string[] } = {}): MapPoint[] {
  return spots.map((s, i) => {
    const lv = s.kind === "site" ? null : freshLevel(live.spots[s.id], now);
    return {
      id: s.id,
      type: "spot" as const,
      coords: s.coords,
      mark: markOf(s, i),
      label: s.name,
      badge: lv === null ? null : { text: SPOT_LEVELS[lv].short, color: SPOT_LEVELS[lv].map },
      variant: s.kind === "site" ? "dark" : s.kind === "pilgrim" ? (opts.visited?.includes(s.id) ? "filled" : "round") : "default",
    };
  });
}

export function roadLines(live: LiveState, now: number): MapLine[] {
  return ROADS.map((r) => {
    const lv = roadWorst(live, r, now);
    return { id: r.id, coords: r.coords, color: lv === null ? NO_INFO_MAP : ROAD_LEVELS[lv].map };
  });
}

export function roadPoints(live: LiveState, now: number): MapPoint[] {
  return ROADS.map((r) => {
    const lv = roadWorst(live, r, now);
    return {
      id: r.id,
      type: "road" as const,
      coords: roadMid(r),
      mark: "道",
      label: undefined,
      badge: lv === null ? null : { text: ROAD_LEVELS[lv].short, color: ROAD_LEVELS[lv].map },
      variant: "round" as const,
    };
  });
}

export function reportPoints(reports: Report[]): MapPoint[] {
  return reports
    .filter((r) => r.coords)
    .map((r) => ({ id: r.id, type: "report" as const, coords: r.coords!, mark: "!", variant: "report" as const }));
}
