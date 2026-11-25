import data from "@/data/spots.json";
import type { LngLat } from "@/lib/types";

export type SpotKind = "pilgrim" | "site" | "viewing" | "parking";

export interface Spot {
  id: string;
  kind: SpotKind;
  name: string;
  tag: string;
  coords: LngLat;
  desc: string;
  capacity?: number;
  unit?: string;
}

export interface Road {
  id: string;
  name: string;
  dirs: string[];
  coords: LngLat[];
}

export const PILGRIM: Spot[] = data.pilgrim as Spot[];
export const LAUNCH: Spot[] = data.launch as Spot[];
export const ROADS: Road[] = (data.roads ?? []) as Road[];
export const ALL_SPOTS: Spot[] = [...LAUNCH, ...PILGRIM];

export type SpotSet = "launch" | "pilgrim";
export const spotsOf = (set: SpotSet): Spot[] => (set === "launch" ? LAUNCH : PILGRIM);

export const spotById = (id: string): Spot | undefined => ALL_SPOTS.find((s) => s.id === id);
export const roadById = (id: string): Road | undefined => ROADS.find((r) => r.id === id);

/** 混雑を入力できるスポットか（射場は対象外） */
export const isRateable = (s: Spot): boolean => s.kind !== "site";

export const KIND_LABEL: Record<SpotKind, string> = {
  pilgrim: "巡礼スポット",
  site: "射場",
  viewing: "見学場",
  parking: "臨時駐車場",
};

/** 地図マーカーの記号 */
export function markOf(s: Spot, index: number): string {
  if (s.kind === "pilgrim") return String(index + 1);
  if (s.kind === "parking") return "P";
  if (s.kind === "site") return "射";
  return "見";
}

/** 道路の入力キー: <区間ID>__<方向番号> */
export const roadKey = (roadId: string, dir: number): string => `${roadId}__${dir}`;

export function parseRoadKey(key: string): { road: Road | undefined; dir: number } {
  const [id, d] = key.split("__");
  return { road: roadById(id), dir: Number(d) };
}

export const roadMid = (r: Road): LngLat => r.coords[Math.floor(r.coords.length / 2)];
