"use client";

import { useState } from "react";
import ModulePageHeader from "@/components/ModulePageHeader";
import { Group, Row } from "@/components/ui/Grouped";
import { NewReportSheet, ReportSheet } from "@/components/ops/DetailSheets";
import { useStaff } from "@/components/StaffProvider";
import { clock } from "@/lib/format";

export default function ReportsPage() {
  const { reports } = useStaff();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <ModulePageHeader
        title="現場報告"
        actions={
          <button type="button" className="ios-btn-primary" onClick={() => setCreating(true)}>
            報告する
          </button>
        }
      />
      {reports.length === 0 ? (
        <div className="rounded-xl bg-card px-4 py-10 text-center">
          <p className="text-[15px] text-label-2">未対応の報告はありません</p>
          <button type="button" className="ios-btn mt-4" onClick={() => setCreating(true)}>
            報告する
          </button>
        </div>
      ) : (
        <Group title={`未対応 ${reports.length}件`}>
          {reports.map((r) => (
            <Row
              key={r.id}
              onClick={() => setOpen(r.id)}
              chevron
              leading={
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-p-orange font-bold text-p-orange-ink" aria-hidden>
                  !
                </span>
              }
            >
              <div className="line-clamp-2 whitespace-pre-line">{r.text}</div>
              <div className="text-[13px] text-label-2">
                {clock(r.at)} ・ {r.by}
                {r.coords ? "" : " ・ 位置なし"}
              </div>
            </Row>
          ))}
        </Group>
      )}
      <ReportSheet id={open} onClose={() => setOpen(null)} />
      <NewReportSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
