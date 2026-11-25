"use client";

import { useEffect, useRef, useState } from "react";
import ModulePageHeader from "@/components/ModulePageHeader";
import Segmented from "@/components/ui/Segmented";
import { Group, Row } from "@/components/ui/Grouped";
import { LevelPill } from "@/components/Level";
import { SpotSheet } from "@/components/ops/DetailSheets";
import { useStaff } from "@/components/StaffProvider";
import { useNow } from "@/lib/hooks";
import { clock } from "@/lib/format";
import { SPOT_LEVELS, freshLevel } from "@/lib/levels";
import { KIND_LABEL, isRateable, spotsOf, type SpotKind, type SpotSet } from "@/lib/spots";

export default function SpotsPage() {
  const { live, loaded } = useStaff();
  const now = useNow();
  const [set, setSet] = useState<SpotSet>(live.mode === "launch" ? "launch" : "pilgrim");
  // 最初にデータが届いた時点のモードに合わせる（以降は手動の切替を優先）
  const initialized = useRef(false);
  useEffect(() => {
    if (!loaded || initialized.current) return;
    initialized.current = true;
    setSet(live.mode === "launch" ? "launch" : "pilgrim");
  }, [loaded, live.mode]);
  const [open, setOpen] = useState<string | null>(null);

  const spots = spotsOf(set).filter(isRateable);
  const kinds = [...new Set(spots.map((s) => s.kind))] as SpotKind[];

  return (
    <div className="mx-auto max-w-3xl">
      <ModulePageHeader
        title="スポット"
        actions={
          <Segmented<SpotSet>
            size="sm"
            ariaLabel="種類"
            value={set}
            onChange={setSet}
            options={[
              { value: "launch", label: "打ち上げ" },
              { value: "pilgrim", label: "巡礼" },
            ]}
          />
        }
      />
      {kinds.map((k) => (
        <Group key={k} title={KIND_LABEL[k]}>
          {spots
            .filter((s) => s.kind === k)
            .map((s) => {
              const e = live.spots[s.id];
              const lv = freshLevel(e, now);
              return (
                <Row
                  key={s.id}
                  onClick={() => setOpen(s.id)}
                  chevron
                  detail={<LevelPill defs={SPOT_LEVELS} level={lv} />}
                >
                  <div>{s.name}</div>
                  <div className="text-[13px] text-label-2">
                    {s.capacity ? `収容 約${s.capacity.toLocaleString()}${s.unit ?? ""}` : s.tag}
                    {e ? ` ・ ${clock(e.at)} ${e.by ?? ""}` : " ・ 未入力"}
                    {e && lv === null ? "（古い）" : ""}
                  </div>
                </Row>
              );
            })}
        </Group>
      ))}
      <SpotSheet id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
