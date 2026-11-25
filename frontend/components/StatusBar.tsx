"use client";

import Link from "next/link";
import { Avatar } from "@/components/AccountSheet";
import { useStaff } from "@/components/StaffProvider";
import { clock } from "@/lib/format";

/** 上部バー（すりガラス）。左: アプリ名（スマホ）と接続状態 / 右: アカウント */
export default function StatusBar({ onOpenAccount }: { onOpenAccount: () => void }) {
  const { me, live, liveError, loaded } = useStaff();
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-separator bg-bar px-4 backdrop-blur-xl md:h-14 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/ops" className="text-[15px] font-bold text-label md:hidden">
          Route 42
        </Link>
        <span className="flex items-center gap-1.5 text-[12px] text-label-2" role="status">
          <span className={`h-2 w-2 rounded-full ${liveError ? "bg-danger" : loaded ? "bg-success" : "bg-label-3"}`} />
          {liveError ? "接続できません" : loaded ? `リアルタイム${live.updatedAt ? ` ・ ${clock(live.updatedAt)} 更新` : ""}` : "接続中…"}
        </span>
      </div>
      <button
        type="button"
        onClick={onOpenAccount}
        className="flex items-center gap-2 rounded-full p-0.5 md:pr-3 md:hover:bg-fill"
        aria-label="アカウント"
      >
        <Avatar name={me.name} size={30} />
        <span className="hidden text-[14px] font-medium text-label md:inline">{me.name}</span>
      </button>
    </header>
  );
}
