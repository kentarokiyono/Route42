"use client";

import { useState } from "react";
import ModulePageHeader from "@/components/ModulePageHeader";
import { Group, Row } from "@/components/ui/Grouped";
import { LevelPill } from "@/components/Level";
import { RoadSheet } from "@/components/ops/DetailSheets";
import { useStaff } from "@/components/StaffProvider";
import { useNow } from "@/lib/hooks";
import { clock } from "@/lib/format";
import { ROAD_LEVELS, freshLevel } from "@/lib/levels";
import { ROADS, roadKey } from "@/lib/spots";

export default function RoadsPage() {
  const { live } = useStaff();
  const now = useNow();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <ModulePageHeader title="道路" />
      {ROADS.map((r) => (
        <Group key={r.id} title={r.name}>
          {r.dirs.map((dirName, d) => {
            const e = live.roads[roadKey(r.id, d)];
            const lv = freshLevel(e, now);
            return (
              <Row key={dirName} onClick={() => setOpen(r.id)} chevron detail={<LevelPill defs={ROAD_LEVELS} level={lv} />}>
                <div>{dirName}</div>
                <div className="text-[13px] text-label-2">
                  {e ? `${clock(e.at)} ${e.by ?? ""}${lv === null ? "（古い）" : ""}` : "未入力"}
                </div>
              </Row>
            );
          })}
        </Group>
      ))}
      <RoadSheet id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
