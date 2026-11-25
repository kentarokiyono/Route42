"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NavIcon from "@/components/NavIcon";
import { useStaff } from "@/components/StaffProvider";
import { MORE_ITEMS, OPS_ITEMS, activeHref, type NavItem } from "@/lib/nav";

/** md 以上で表示する左サイドバー */
export default function Sidebar() {
  const current = activeHref(usePathname());
  const { reports, backend } = useStaff();

  function renderItem(item: NavItem, small = false) {
    const active = current === item.href;
    const external = item.href === "/status" || item.href === "/";
    return (
      <Link
        key={item.href}
        href={item.href}
        target={external ? "_blank" : undefined}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-ios px-2.5 transition-colors ${
          small ? "py-[5px] text-[14px]" : "py-[8px] text-[16px]"
        } ${active ? "bg-accent-soft text-accent-ink" : small ? "text-label-2 hover:bg-fill" : "text-label hover:bg-fill"}`}
      >
        <NavIcon
          name={item.href}
          className={`${small ? "h-4 w-4" : "h-[19px] w-[19px]"} ${active ? "" : small ? "text-label-2" : "text-accent"}`}
        />
        <span className="flex-1">{item.label}</span>
        {item.href === "/ops/reports" && reports.length > 0 && (
          <span className="tabular-nums rounded-full bg-p-red px-2 text-[12px] font-semibold text-p-red-ink">{reports.length}</span>
        )}
      </Link>
    );
  }

  return (
    <aside
      className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-separator bg-sidebar md:flex"
      aria-label="メインメニュー"
    >
      <Link href="/ops" className="block px-5 pb-4 pt-5">
        <span className="block text-[20px] font-bold tracking-tight text-label">Route 42</span>
        <span className="block text-[13px] text-label-2">串本町・那智勝浦町</span>
      </Link>
      {backend.isDemo && (
        <div className="mx-3 mb-1 rounded-ios bg-p-orange px-2.5 py-1.5 text-[12px] font-semibold text-p-orange-ink">
          デモモード（この端末のみ）
        </div>
      )}
      <nav className="space-y-0.5 px-3 pt-3">{OPS_ITEMS.map((i) => renderItem(i))}</nav>
      <nav className="mx-3 mt-3 space-y-0.5 border-t border-separator pt-3">{MORE_ITEMS.map((i) => renderItem(i, true))}</nav>
    </aside>
  );
}
