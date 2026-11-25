"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NavIcon from "@/components/NavIcon";
import { useStaff } from "@/components/StaffProvider";
import { OPS_ITEMS, TAB_HREFS, activeHref } from "@/lib/nav";

/** スマホ用の下部タブバー（iOS 風） */
export default function TabBar() {
  const pathname = activeHref(usePathname());
  const { reports } = useStaff();
  const tabs = TAB_HREFS.map((h) => OPS_ITEMS.find((i) => i.href === h)!).filter(Boolean);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-separator bg-bar pb-safe backdrop-blur-xl md:hidden" aria-label="タブ">
      <div className="grid grid-cols-5">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 pb-1 pt-1.5 text-[10px] font-medium ${active ? "text-accent" : "text-label-2"}`}
            >
              <NavIcon name={t.href} className="h-6 w-6" />
              {t.label}
              {t.href === "/ops/reports" && reports.length > 0 && (
                <span className="tabular-nums absolute right-[calc(50%-22px)] top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
                  {reports.length}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
