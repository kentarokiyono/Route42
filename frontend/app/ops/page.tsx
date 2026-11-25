"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ModulePageHeader from "@/components/ModulePageHeader";
import MapView, { type MapSel } from "@/components/MapView";
import Segmented from "@/components/ui/Segmented";
import { NewReportSheet, ReportSheet, RoadSheet, SpotSheet } from "@/components/ops/DetailSheets";
import { useStaff } from "@/components/StaffProvider";
import { useNow } from "@/lib/hooks";
import { clock, launchTime } from "@/lib/format";
import { LAUNCH_LABEL, countAlerts, isLaunchAlert } from "@/lib/levels";
import { reportPoints, roadLines, roadPoints, spotPoints } from "@/lib/mapData";
import { ALL_SPOTS, ROADS, spotsOf, type SpotSet } from "@/lib/spots";
import type { LngLat } from "@/lib/types";

function Metric({ label, value, href, warn }: { label: string; value: string; href: string; warn?: boolean }) {
  return (
    <Link href={href} className="rounded-2xl bg-card px-4 py-3 active:opacity-70">
      <p className="text-[13px] text-label-2">{label}</p>
      <p className={`tabular-nums mt-0.5 text-[28px] font-bold leading-tight ${warn ? "text-danger" : "text-label"}`}>{value}</p>
    </Link>
  );
}

export default function OverviewPage() {
  const { live, reports, loaded } = useStaff();
  const now = useNow();
  const [set, setSet] = useState<SpotSet>(live.mode === "launch" ? "launch" : "pilgrim");
  // 最初にデータが届いた時点のモードに合わせる（以降は手動の切替を優先）
  const initialized = useRef(false);
  useEffect(() => {
    if (!loaded || initialized.current) return;
    initialized.current = true;
    setSet(live.mode === "launch" ? "launch" : "pilgrim");
  }, [loaded, live.mode]);
  const [sel, setSel] = useState<MapSel>(null);
  const [newReport, setNewReport] = useState(false);
  const center = useRef<LngLat | null>(null);

  const { crowded, jammed } = countAlerts(live, ALL_SPOTS.map((s) => s.id), now);
  const points = useMemo(
    () => [
      ...(set === "launch" ? roadPoints(live, now) : []),
      ...spotPoints(spotsOf(set), live, now),
      ...reportPoints(reports),
    ],
    [set, live, now, reports]
  );
  const lines = useMemo(() => (set === "launch" ? roadLines(live, now) : []), [set, live, now]);
  const fitCoords = useMemo(
    () => [...spotsOf(set).map((s) => s.coords), ...(set === "launch" ? ROADS.flatMap((r) => r.coords) : [])],
    [set]
  );
  const st = live.launch.state;

  return (
    <div>
      <ModulePageHeader
        title="概要"
        actions={
          <button type="button" className="ios-btn-primary" onClick={() => setNewReport(true)}>
            現場報告
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="混雑・満員のスポット" value={`${crowded}件`} href="/ops/spots" warn={crowded > 0} />
        <Metric label="渋滞・通行止め" value={`${jammed}件`} href="/ops/roads" warn={jammed > 0} />
        <Metric label="未対応の現場報告" value={`${reports.length}件`} href="/ops/reports" warn={reports.length > 0} />
        <Metric label="最終更新" value={live.updatedAt ? clock(live.updatedAt) : "—"} href="/ops/log" />
      </div>

      <div className="mb-4 space-y-2">
        {live.mode === "launch" && (
          <Link
            href="/ops/settings"
            className={`flex flex-col gap-0.5 rounded-xl px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-3 ${isLaunchAlert(st) ? "bg-p-red text-p-red-ink" : "bg-p-blue text-p-blue-ink"}`}
          >
            <span className="font-semibold">打ち上げモード ・ {LAUNCH_LABEL[st]}</span>
            <span className="tabular-nums text-[13px]">{[launchTime(live.launch.time), live.launch.note].filter(Boolean).join(" ・ ")}</span>
          </Link>
        )}
        {live.notice && (
          <Link href="/ops/settings" className="block rounded-xl bg-card px-4 py-3">
            <span className="text-[13px] font-semibold text-accent">お知らせ</span>
            <p className="whitespace-pre-line text-[15px]">{live.notice.text}</p>
            <p className="text-[12px] text-label-2">
              {clock(live.notice.at)} {live.notice.by}
            </p>
          </Link>
        )}
      </div>

      <div className="relative overflow-hidden rounded-xl bg-card">
        <div className="absolute left-3 top-3 z-10">
          <Segmented<SpotSet>
            size="sm"
            ariaLabel="地図に表示するスポット"
            className="w-48 bg-card/90 shadow-sm backdrop-blur-xl"
            value={set}
            onChange={(v) => {
              setSet(v);
              setSel(null);
            }}
            options={[
              { value: "launch", label: "打ち上げ" },
              { value: "pilgrim", label: "巡礼" },
            ]}
          />
        </div>
        <MapView
          className="h-[62vh] min-h-[380px] w-full"
          points={points}
          lines={lines}
          selected={sel}
          onSelect={setSel}
          fitKey={set}
          fitCoords={fitCoords}
          padding={{ top: 60, bottom: 40, left: 40, right: 40 }}
          geolocate
          onCenter={(c) => (center.current = c)}
        />
      </div>

      <SpotSheet id={sel?.type === "spot" ? sel.id : null} onClose={() => setSel(null)} />
      <RoadSheet id={sel?.type === "road" ? sel.id : null} onClose={() => setSel(null)} />
      <ReportSheet id={sel?.type === "report" ? sel.id : null} onClose={() => setSel(null)} />
      <NewReportSheet open={newReport} onClose={() => setNewReport(false)} mapCenter={() => center.current} />
    </div>
  );
}
