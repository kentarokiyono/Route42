"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import Segmented from "@/components/ui/Segmented";
import { Group, Row } from "@/components/ui/Grouped";
import { useStaff } from "@/components/StaffProvider";
import { applyTheme, getThemePref, type ThemePref } from "@/lib/theme";

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-ink"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden
    >
      {name.trim().slice(0, 1) || "?"}
    </span>
  );
}

export default function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, backend } = useStaff();
  const [theme, setTheme] = useState<ThemePref>("system");
  useEffect(() => {
    if (open) setTheme(getThemePref());
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="アカウント" trailing={<button type="button" onClick={onClose} className="ios-btn-plain font-semibold">完了</button>}>
      <Group>
        <Row leading={<Avatar name={me.name} size={40} />}>
          <div className="font-semibold">{me.name}</div>
          <div className="text-[13px] text-label-2">{me.email}</div>
        </Row>
        <Row detail={me.role === "owner" ? "オーナー" : "職員"}>権限</Row>
      </Group>
      <Group title="表示">
        <div className="px-4 py-3">
          <Segmented<ThemePref>
            ariaLabel="表示テーマ"
            className="flex w-full"
            value={theme}
            onChange={(v) => {
              setTheme(v);
              applyTheme(v);
            }}
            options={[
              { value: "light", label: "ライト" },
              { value: "dark", label: "ダーク" },
              { value: "system", label: "端末に合わせる" },
            ]}
          />
        </div>
      </Group>
      <Group>
        <Row onClick={() => backend.signOut()} destructive>
          ログアウト
        </Row>
      </Group>
    </Sheet>
  );
}
