"use client";

import Link from "next/link";
import { Group, Row } from "@/components/ui/Grouped";
import { LevelPill } from "@/components/Level";
import { usePublicStatus, useNow } from "@/lib/hooks";
import { clock, gmapsDir, launchTime } from "@/lib/format";
import { LAUNCH_LABEL, ROAD_LEVELS, SPOT_LEVELS, freshLevel, isLaunchAlert } from "@/lib/levels";
import { LAUNCH, PILGRIM, ROADS, roadKey, type Spot } from "@/lib/spots";
import type { LiveState } from "@/lib/types";

/** 一般向けの混雑情報。地図は読み込まない（回線が混んでも開けるように） */
export default function StatusPage() {
  const { data, fetchedAt, error, reload, isDemo } = usePublicStatus();
  const now = useNow();
  const launch = data?.mode === "launch";

  return (
    <main className="mx-auto max-w-2xl px-4 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <h1 className="text-[28px] font-bold leading-tight tracking-tight md:text-[34px]">
        {launch ? "ロケット打ち上げ 混雑情報" : "巡礼スポット 混雑情報"}
      </h1>
      <p className="mb-5 mt-1 text-[13px] text-label-2">串本町・那智勝浦町の職員が現地の状況を入力しています</p>

      {isDemo && <p className="mb-4 rounded-xl bg-p-orange px-4 py-2.5 text-[13px] text-p-orange-ink">デモモード（この端末のブラウザ内のデータを表示）</p>}
      {error && (
        <p className="mb-4 rounded-xl bg-p-red px-4 py-2.5 text-[15px] text-p-red-ink" role="alert">
          {data ? `通信できません。${clock(fetchedAt)} に取得した情報を表示しています。` : "通信できません。電波の良い場所で「更新」を押してください。"}
        </p>
      )}

      {data && (
        <>
          {launch && (
            <div className={`mb-4 rounded-2xl px-4 py-4 ${isLaunchAlert(data.launch.state) ? "bg-p-red text-p-red-ink" : "bg-p-blue text-p-blue-ink"}`}>
              <p className="text-[22px] font-bold">{LAUNCH_LABEL[data.launch.state]}</p>
              <p className="tabular-nums text-[15px]">
                {[launchTime(data.launch.time) && `予定 ${launchTime(data.launch.time)}`, data.launch.note].filter(Boolean).join(" ・ ")}
              </p>
            </div>
          )}
          {data.notice && (
            <div className="mb-6 rounded-xl bg-card px-4 py-3">
              <p className="text-[13px] font-semibold text-accent">お知らせ</p>
              <p className="whitespace-pre-line text-[15px]">{data.notice.text}</p>
              <p className="text-[12px] text-label-2">{clock(data.notice.at)} 更新</p>
            </div>
          )}

          {(launch || hasFreshRoad(data, now)) && <RoadGroup data={data} now={now} />}
          {launch ? (
            <>
              <SpotGroup title="見学場（空いている順）" spots={LAUNCH.filter((s) => s.kind === "viewing")} data={data} now={now} />
              <SpotGroup title="臨時駐車場（空いている順）" spots={LAUNCH.filter((s) => s.kind === "parking")} data={data} now={now} />
            </>
          ) : (
            <SpotGroup title="巡礼スポット（空いている順）" spots={PILGRIM} data={data} now={now} />
          )}
        </>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[13px] text-label-2">
        <span className="tabular-nums">
          {data?.updatedAt ? `最終更新 ${clock(data.updatedAt)}` : data ? "情報未入力" : "読み込み中…"} ・ 60秒ごとに自動更新
        </span>
        <button type="button" className="ios-btn py-1.5" onClick={reload}>
          更新
        </button>
      </div>

      <p className="mb-4 rounded-xl bg-card px-4 py-3 text-[13px] text-label-2">
        この情報は職員が現地で確認した目安です。実際の状況と異なる場合があります。交通規制・打ち上げ日時は、警察・道路管理者・運営事業者などの公式発表を必ずご確認ください。
      </p>
      <Link href="/" className="ios-btn-plain px-1">
        巡礼マップ（地図）を開く ›
      </Link>
    </main>
  );
}

function hasFreshRoad(d: LiveState, now: number) {
  return Object.values(d.roads).some((e) => freshLevel(e, now) !== null);
}

function SpotGroup({ title, spots, data, now }: { title: string; spots: Spot[]; data: LiveState; now: number }) {
  const rows = spots
    .map((s) => ({ s, e: data.spots[s.id], lv: freshLevel(data.spots[s.id], now) }))
    .sort((a, b) => (a.lv ?? 9) - (b.lv ?? 9));
  return (
    <Group title={title}>
      {rows.map(({ s, e, lv }) => (
        <Row
          key={s.id}
          detail={
            <span className="flex items-center gap-2">
              <LevelPill defs={SPOT_LEVELS} level={lv} />
              <a
                href={gmapsDir(s.coords)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${s.name}へのナビ`}
                className="rounded-full bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-accent-ink"
              >
                ナビ
              </a>
            </span>
          }
        >
          <div>{s.name}</div>
          <div className="tabular-nums text-[13px] text-label-2">
            {s.capacity ? `収容 約${s.capacity.toLocaleString()}${s.unit ?? ""}` : s.tag}
            {lv !== null && e ? ` ・ ${clock(e.at)} 時点` : ""}
          </div>
        </Row>
      ))}
    </Group>
  );
}

function RoadGroup({ data, now }: { data: LiveState; now: number }) {
  return (
    <Group title="道路状況">
      {ROADS.flatMap((r) =>
        r.dirs.map((dirName, d) => {
          const e = data.roads[roadKey(r.id, d)];
          const lv = freshLevel(e, now);
          return (
            <Row key={`${r.id}-${d}`} detail={<LevelPill defs={ROAD_LEVELS} level={lv} />}>
              <div>{d === 0 ? r.name : <span className="text-label-2">〃</span>}</div>
              <div className="tabular-nums text-[13px] text-label-2">
                {dirName}
                {lv !== null && e ? ` ・ ${clock(e.at)} 時点` : ""}
              </div>
            </Row>
          );
        })
      )}
    </Group>
  );
}
