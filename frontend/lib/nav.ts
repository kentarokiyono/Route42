export interface NavItem {
  href: string;
  label: string;
  /** オーナーだけに出す */
  ownerOnly?: boolean;
}

/** 職員アプリのメニュー */
export const OPS_ITEMS: NavItem[] = [
  { href: "/ops", label: "概要" },
  { href: "/ops/spots", label: "スポット" },
  { href: "/ops/roads", label: "道路" },
  { href: "/ops/reports", label: "現場報告" },
  { href: "/ops/settings", label: "配信設定" },
];

export const MORE_ITEMS: NavItem[] = [
  { href: "/ops/log", label: "入力履歴" },
  { href: "/status", label: "一般向けページ" },
  { href: "/", label: "巡礼マップ" },
];

/** スマホ下部タブ */
export const TAB_HREFS = ["/ops", "/ops/spots", "/ops/roads", "/ops/reports", "/ops/settings"];

export function activeHref(pathname: string): string {
  return pathname.replace(/\/$/, "") || "/";
}
