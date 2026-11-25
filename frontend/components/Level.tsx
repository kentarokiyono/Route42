"use client";

import { BADGE } from "@/lib/palette";
import type { LevelDef } from "@/lib/levels";
import type { Level } from "@/lib/types";

/** 混雑度の表示（淡い地＋濃い文字）。null は「情報なし」 */
export function LevelPill({ defs, level, className = "" }: { defs: LevelDef[]; level: Level | null; className?: string }) {
  if (level === null) {
    return <span className={`inline-block whitespace-nowrap rounded-full bg-fill px-2.5 py-0.5 text-[13px] font-semibold text-label-2 ${className}`}>情報なし</span>;
  }
  const d = defs[level];
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${BADGE[d.tone]} ${className}`}>
      {d.label}
    </span>
  );
}

/** 混雑度の入力ボタン。押した時点で確定する */
export function LevelPicker({
  defs,
  value,
  onPick,
  columns = 2,
  busy,
  label,
}: {
  defs: LevelDef[];
  value: Level | null;
  onPick: (level: Level) => void;
  columns?: 2 | 4;
  busy?: boolean;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${columns === 4 ? "grid-cols-4" : "grid-cols-2"}`}>
      {defs.map((d, i) => {
        const on = value === i;
        return (
          <button
            key={d.label}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={busy}
            onClick={() => onPick(i as Level)}
            className={`min-h-[50px] rounded-ios px-2 text-[15px] font-semibold transition-opacity active:opacity-70 disabled:opacity-50 ${
              on ? `${BADGE[d.tone]} ring-2 ring-current` : "bg-fill text-label"
            }`}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
