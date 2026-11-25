"use client";

import ModulePageHeader from "@/components/ModulePageHeader";
import { Group, Row } from "@/components/ui/Grouped";
import { useStaff } from "@/components/StaffProvider";
import { dateClock } from "@/lib/format";
import { logText } from "@/lib/logText";

export default function LogPage() {
  const { logs } = useStaff();
  return (
    <div className="mx-auto max-w-3xl">
      <ModulePageHeader title="入力履歴" />
      {logs.length === 0 ? (
        <div className="rounded-xl bg-card px-4 py-10 text-center text-[15px] text-label-2">履歴はまだありません</div>
      ) : (
        <Group title="最新50件">
          {logs.map((g) => (
            <Row key={g.id} detail={<span className="tabular-nums text-[13px]">{dateClock(g.at)}</span>}>
              <div className="text-[13px] text-label-2">{g.actor}</div>
              <div className="whitespace-pre-line">{logText(g)}</div>
            </Row>
          ))}
        </Group>
      )}
    </div>
  );
}
