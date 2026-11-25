import type { LngLat } from "@/lib/types";

export function clock(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function dateClock(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${clock(ms)}`;
}

/** "2026-12-03T09:05" → "12/3 09:05" */
export function launchTime(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || "");
  return m ? `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}` : "";
}

export function km(m: number): string {
  return `約${m < 10000 ? (m / 1000).toFixed(1) : Math.round(m / 1000)}km`;
}

export function minutes(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `約${min}分`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return `約${h}時間${r ? `${r}分` : ""}`;
}

export function haversineKm(a: LngLat, b: LngLat): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Google マップの車ルート（origin 省略時は現在地から） */
export function gmapsDir(dest: LngLat, origin?: LngLat): string {
  let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${dest[1]},${dest[0]}`;
  if (origin) url += `&origin=${origin[1]},${origin[0]}`;
  return url;
}

export function gmapsPlace(p: LngLat): string {
  return `https://www.google.com/maps/search/?api=1&query=${p[1]},${p[0]}`;
}
