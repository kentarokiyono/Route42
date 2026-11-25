"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MapView, { type MapSel } from "@/components/MapView";
import Sheet from "@/components/ui/Sheet";
import { Group, Row } from "@/components/ui/Grouped";
import { LevelPill } from "@/components/Level";
import { usePublicStatus, useNow } from "@/lib/hooks";
import { clock, gmapsDir, haversineKm, km, launchTime, minutes } from "@/lib/format";
import { LAUNCH_LABEL, SPOT_LEVELS, freshLevel, isLaunchAlert } from "@/lib/levels";
import { spotPoints } from "@/lib/mapData";
import { PILGRIM } from "@/lib/spots";
import { emptyLive, type LngLat } from "@/lib/types";

const VISITED_KEY = "route42.visited";
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

interface Leg {
  distance: number;
  duration: number;
}

/** 巡礼ルートの道路形状と区間ごとの距離・時間（事前計算 → なければ Directions API） */
function useRoute() {
  const [route, setRoute] = useState<{ coords: LngLat[]; legs: Leg[] | null; failed: boolean }>({
    coords: PILGRIM.map((s) => s.coords),
    legs: null,
    failed: false,
  });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/data/route.json");
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j.legs) && j.legs.length === PILGRIM.length - 1) {
            if (alive) setRoute({ coords: j.coordinates, legs: j.legs, failed: false });
            return;
          }
        }
      } catch {
        // 次の方法へ
      }
      try {
        if (!TOKEN) throw new Error("no token");
        const wp = PILGRIM.map((s) => s.coords.join(",")).join(";");
        const r = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${wp}?geometries=geojson&overview=full&access_token=${TOKEN}`);
        const j = await r.json();
        const rt = j.routes?.[0];
        if (!rt) throw new Error("no route");
        if (alive) setRoute({ coords: rt.geometry.coordinates, legs: rt.legs.map((l: Leg) => ({ distance: l.distance, duration: l.duration })), failed: false });
      } catch {
        if (alive) setRoute((p) => ({ ...p, failed: true }));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return route;
}

function useVisited(): [string[], (id: string) => void] {
  const [v, setV] = useState<string[]>([]);
  useEffect(() => {
    try {
      const x = JSON.parse(localStorage.getItem(VISITED_KEY) || "[]");
      if (Array.isArray(x)) setV(x.filter((id) => typeof id === "string" && PILGRIM.some((s) => s.id === id)));
    } catch {
      // noop
    }
  }, []);
  const toggle = (id: string) =>
    setV((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(VISITED_KEY, JSON.stringify(next));
      } catch {
        // 保存できなくても画面は動かす
      }
      return next;
    });
  return [v, toggle];
}

export default function PilgrimMapPage() {
  const { data } = usePublicStatus();
  const live = data ?? emptyLive();
  const now = useNow();
  const route = useRoute();
  const [visited, toggleVisited] = useVisited();
  const [sel, setSel] = useState<MapSel>(null);
  const [listOpen, setListOpen] = useState(false);

  const index = sel?.type === "spot" ? PILGRIM.findIndex((s) => s.id === sel.id) : -1;
  const spot = index >= 0 ? PILGRIM[index] : null;
  const points = useMemo(() => spotPoints(PILGRIM, live, now, { visited }), [live, now, visited]);
  const lines = useMemo(() => [{ id: "route", coords: route.coords, color: "#3a76c4", width: 4 }], [route.coords]);

  const legText = (i: number) =>
    route.legs?.[i] ? `${km(route.legs[i].distance)}・${minutes(route.legs[i].duration)}` : route.failed ? "—" : "計算中…";
  const total = route.legs?.reduce((a, l) => ({ d: a.d + l.distance, t: a.t + l.duration }), { d: 0, t: 0 });

  // 混んでいる時は、空いている最寄りのスポットを提案
  const lv = spot ? freshLevel(live.spots[spot.id], now) : null;
  const alt = useMemo(() => {
    if (!spot || lv === null || lv < 2) return null;
    let best: { i: number; d: number; lv: number } | null = null;
    PILGRIM.forEach((s, i) => {
      if (s.id === spot.id) return;
      const l = freshLevel(live.spots[s.id], now);
      if (l === null || l > 1) return;
      const d = haversineKm(spot.coords, s.coords);
      if (!best || d < best.d) best = { i, d, lv: l };
    });
    return best as { i: number; d: number; lv: number } | null;
  }, [spot, lv, live, now]);

  return (
    <div className="fixed inset-0 bg-grouped">
      {/* 地図ライブラリの CSS が position を上書きするため、外側の枠で配置する */}
      <div className="absolute inset-0">
      <MapView
        className="h-full w-full"
        points={points}
        lines={lines}
        selected={sel}
        onSelect={setSel}
        fitKey="pilgrim"
        padding={{ top: 140, bottom: spot ? 340 : 60, left: 40, right: 40 }}
        geolocate
        ariaLabel="巡礼ルートの地図"
      />
      </div>

      {/* 上部 */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-grouped via-grouped/90 to-transparent px-4 pb-6 pt-[calc(12px+env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-label-2">南紀 巡礼の道</p>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">国道42号</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="tabular-nums rounded-full bg-card px-3 py-1.5 text-[13px] text-label-2 shadow-sm">
              <b className="text-[15px] text-accent">{visited.length}</b> / {PILGRIM.length} 訪問
            </span>
            <button type="button" className="ios-btn-gray bg-card py-1.5 shadow-sm" onClick={() => setListOpen(true)}>
              一覧
            </button>
          </div>
        </div>
        <div className="pointer-events-auto mx-auto mt-2 max-w-3xl space-y-2">
          {live.mode === "launch" && (
            <Link
              href="/status"
              className={`block rounded-xl px-4 py-2.5 ${isLaunchAlert(live.launch.state) ? "bg-p-red text-p-red-ink" : "bg-p-blue text-p-blue-ink"}`}
            >
              <span className="font-semibold">ロケット打ち上げ ・ {LAUNCH_LABEL[live.launch.state]}</span>
              {launchTime(live.launch.time) && <span className="tabular-nums ml-2 text-[13px]">予定 {launchTime(live.launch.time)}</span>}
              <span className="block text-[13px]">見学場・駐車場・道路の混雑情報を見る ›</span>
            </Link>
          )}
          {live.notice && (
            <div className="rounded-xl bg-card px-4 py-2.5 shadow-sm">
              <p className="whitespace-pre-line text-[15px]">{live.notice.text}</p>
              <p className="text-[12px] text-label-2">{clock(live.notice.at)} 更新</p>
            </div>
          )}
        </div>
      </header>

      {/* 選んだスポット */}
      {spot && (
        <section
          aria-label={spot.name}
          className="absolute inset-x-0 bottom-0 z-20 mx-auto max-h-[70vh] max-w-3xl animate-sheet-up overflow-y-auto rounded-t-[14px] bg-card px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2 shadow-2xl md:bottom-4 md:rounded-[14px]"
        >
          <div className="mb-2 flex justify-center md:hidden">
            <span className="h-[5px] w-9 rounded-full bg-label-3" />
          </div>
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] text-label-2">
                {index + 1}番目 ・ {spot.tag}
              </p>
              <h2 className="text-[22px] font-bold tracking-tight">{spot.name}</h2>
            </div>
            <button type="button" onClick={() => setSel(null)} aria-label="閉じる" className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-fill text-label-2">
              ×
            </button>
          </div>
          <p className="mb-3 text-[15px] leading-relaxed">{spot.desc}</p>
          <div className="mb-3 overflow-hidden rounded-xl bg-grouped [&>*+*]:border-t [&>*+*]:border-separator">
            <Row detail={<LevelPill defs={SPOT_LEVELS} level={lv} />}>混雑状況</Row>
            {index < PILGRIM.length - 1 ? (
              <Row detail={<span className="tabular-nums">{legText(index)}</span>}>次：{PILGRIM[index + 1].name}</Row>
            ) : (
              <Row detail="">最後のスポットです</Row>
            )}
          </div>
          {alt && (
            <div className="mb-3 rounded-xl bg-p-orange px-4 py-3 text-p-orange-ink">
              <p className="text-[15px]">
                混雑しています。近くの空いている候補：{PILGRIM[alt.i].name}（直線 約{alt.d.toFixed(1)}km）
              </p>
              <button type="button" className="mt-2 font-semibold underline" onClick={() => setSel({ type: "spot", id: PILGRIM[alt.i].id })}>
                {PILGRIM[alt.i].name} を見る
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <a href={gmapsDir(spot.coords)} target="_blank" rel="noopener noreferrer" className="ios-btn-primary">
              ナビ開始
            </a>
            <button type="button" className="ios-btn" onClick={() => toggleVisited(spot.id)}>
              {visited.includes(spot.id) ? "訪問済み（取り消す）" : "訪問した"}
            </button>
          </div>
          <div className="mt-2 flex justify-between">
            <button type="button" className="ios-btn-plain py-2" disabled={index === 0} onClick={() => setSel({ type: "spot", id: PILGRIM[index - 1].id })}>
              ‹ 前へ
            </button>
            {index < PILGRIM.length - 1 && (
              <a className="ios-btn-plain py-2" target="_blank" rel="noopener noreferrer" href={gmapsDir(PILGRIM[index + 1].coords, spot.coords)}>
                次への道順
              </a>
            )}
            <button type="button" className="ios-btn-plain py-2" disabled={index === PILGRIM.length - 1} onClick={() => setSel({ type: "spot", id: PILGRIM[index + 1].id })}>
              次へ ›
            </button>
          </div>
        </section>
      )}

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="スポット一覧" trailing={<button type="button" className="ios-btn-plain font-semibold" onClick={() => setListOpen(false)}>完了</button>}>
        <p className="mb-2 px-1 text-[13px] text-label-2">
          全{PILGRIM.length}か所{total ? ` ・ 全行程 ${km(total.d)}・${minutes(total.t)}（車）` : ""}
        </p>
        <Group>
          {PILGRIM.map((s, i) => (
            <Row
              key={s.id}
              onClick={() => {
                setListOpen(false);
                setSel({ type: "spot", id: s.id });
              }}
              chevron
              leading={
                <span
                  className={`tabular-nums flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ${
                    visited.includes(s.id) ? "bg-accent text-white" : "bg-accent-soft text-accent-ink"
                  }`}
                >
                  {i + 1}
                </span>
              }
              detail={<LevelPill defs={SPOT_LEVELS} level={freshLevel(live.spots[s.id], now)} />}
            >
              <div>{s.name}</div>
              <div className="text-[13px] text-label-2">
                {visited.includes(s.id) ? "訪問済み" : "未訪問"}
                {i < PILGRIM.length - 1 ? ` ・ 次まで ${legText(i)}` : ""}
              </div>
            </Row>
          ))}
        </Group>
      </Sheet>
    </div>
  );
}
