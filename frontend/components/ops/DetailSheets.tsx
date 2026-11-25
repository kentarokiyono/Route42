"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import Segmented from "@/components/ui/Segmented";
import { Group, Row } from "@/components/ui/Grouped";
import { LevelPicker } from "@/components/Level";
import { useStaff } from "@/components/StaffProvider";
import { useToast } from "@/components/Toast";
import { REPORT_MAX } from "@/lib/backend";
import { clock, gmapsDir } from "@/lib/format";
import { ROAD_LEVELS, SPOT_LEVELS, freshLevel } from "@/lib/levels";
import { KIND_LABEL, roadById, roadKey, spotById } from "@/lib/spots";
import type { Entry, Level, LngLat } from "@/lib/types";

function updated(e: Entry | undefined, now = Date.now()): string {
  if (!e) return "未入力";
  return `${clock(e.at)} ${e.by ?? ""}${freshLevel(e, now) === null ? "（60分以上前・一般には非表示）" : ""}`;
}

/** 外部（Google マップ）を別タブで開く行 */
export function ExternalRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2.5 text-[15px] text-accent active:bg-fill">
      <span className="flex-1">{children}</span>
      <svg viewBox="0 0 8 13" className="h-[13px] w-2 shrink-0 text-label-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M1.5 1.5l5 5-5 5" />
      </svg>
    </a>
  );
}

const done = (onClose: () => void) => (
  <button type="button" onClick={onClose} className="ios-btn-plain font-semibold">
    完了
  </button>
);

/** スポットの詳細と混雑度の入力 */
export function SpotSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { live, backend } = useStaff();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const s = id ? spotById(id) : undefined;
  if (!s) return null;
  const e = live.spots[s.id];

  async function pick(level: Level) {
    setBusy(true);
    try {
      await backend.setSpotLevel(s!.id, level);
      toast.success(`${s!.name}：${SPOT_LEVELS[level].label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "入力できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={s.name} trailing={done(onClose)}>
      <Group>
        <Row detail={KIND_LABEL[s.kind]}>種類</Row>
        {s.capacity ? <Row detail={`約${s.capacity.toLocaleString()}${s.unit ?? ""}`}>収容</Row> : null}
        <Row detail={<span className="text-[13px]">{updated(e)}</span>}>更新</Row>
      </Group>
      {s.kind !== "site" && (
        <Group title="混雑度">
          <div className="p-3">
            <LevelPicker label="混雑度" defs={SPOT_LEVELS} value={freshLevel(e)} onPick={pick} busy={busy} />
          </div>
        </Group>
      )}
      <Group>
        <ExternalRow href={gmapsDir(s.coords)}>Google マップでナビ</ExternalRow>
      </Group>
    </Sheet>
  );
}

/** 道路区間の詳細と方向別の入力 */
export function RoadSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { live, backend } = useStaff();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const r = id ? roadById(id) : undefined;
  if (!r) return null;

  async function pick(dir: number, level: Level) {
    if (level === 3 && !window.confirm(`${r!.name}（${r!.dirs[dir]}）を「通行止め」として配信しますか？`)) return;
    setBusy(true);
    try {
      await backend.setRoadLevel(r!.id, dir, level);
      toast.success(`${r!.dirs[dir]}：${ROAD_LEVELS[level].label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "入力できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={r.name} trailing={done(onClose)}>
      {r.dirs.map((dirName, d) => {
        const e = live.roads[roadKey(r.id, d)];
        return (
          <Group key={dirName} title={dirName} action={<span className="text-label-2">{updated(e)}</span>}>
            <div className="p-3">
              <LevelPicker label={dirName} defs={ROAD_LEVELS} value={freshLevel(e)} onPick={(lv) => pick(d, lv)} busy={busy} columns={4} />
            </div>
          </Group>
        );
      })}
    </Sheet>
  );
}

/** 現場報告の詳細 */
export function ReportSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { reports, backend } = useStaff();
  const toast = useToast();
  const r = reports.find((x) => x.id === id);
  if (!id || !r) return null;

  async function resolve() {
    if (!window.confirm("この報告を対応済みにしますか？")) return;
    try {
      await backend.resolveReport(r!.id);
      toast.success("対応済みにしました");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新できませんでした");
    }
  }

  return (
    <Sheet open onClose={onClose} title="現場報告" trailing={done(onClose)}>
      <Group>
        <div className="whitespace-pre-line px-4 py-3 text-[15px]">{r.text}</div>
      </Group>
      <Group>
        <Row detail={r.by}>報告者</Row>
        <Row detail={clock(r.at)}>時刻</Row>
        {r.coords ? (
          <ExternalRow href={gmapsDir(r.coords)}>この場所へナビ</ExternalRow>
        ) : (
          <Row detail="なし">位置</Row>
        )}
      </Group>
      <button type="button" onClick={resolve} className="ios-btn-primary w-full">
        対応済みにする
      </button>
    </Sheet>
  );
}

type LocMode = "gps" | "center" | "none";

/** 現場報告を送る */
export function NewReportSheet({
  open,
  onClose,
  mapCenter,
}: {
  open: boolean;
  onClose: () => void;
  /** 地図画面から開いたときの地図の中心 */
  mapCenter?: () => LngLat | null;
}) {
  const { backend } = useStaff();
  const toast = useToast();
  const [text, setText] = useState("");
  const [loc, setLoc] = useState<LocMode>("gps");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const position = () =>
    new Promise<LngLat>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("この端末では現在地を使えません"));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve([p.coords.longitude, p.coords.latitude]),
        () => reject(new Error("現在地を取得できませんでした（「位置なし」でも送れます）")),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    });

  async function send() {
    setError("");
    setBusy(true);
    try {
      const coords = loc === "gps" ? await position() : loc === "center" ? mapCenter?.() ?? null : null;
      await backend.addReport(text, coords);
      toast.success("報告を送りました");
      setText("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "送れませんでした");
    } finally {
      setBusy(false);
    }
  }

  const options: { value: LocMode; label: string }[] = [
    { value: "gps", label: "現在地" },
    ...(mapCenter ? [{ value: "center" as const, label: "地図の中心" }] : []),
    { value: "none", label: "位置なし" },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      locked={busy}
      title="現場報告"
      leading={
        <button type="button" onClick={onClose} className="ios-btn-plain">
          キャンセル
        </button>
      }
      trailing={
        <button type="button" onClick={send} disabled={busy || !text.trim()} className="ios-btn-plain font-semibold">
          {busy ? "送信中" : "送信"}
        </button>
      }
    >
      <label className="mb-4 block">
        <span className="mb-1 block px-1 text-[13px] text-label-2">内容（{REPORT_MAX}文字まで・職員のみ閲覧）</span>
        <textarea
          className="ios-input min-h-[120px] resize-y"
          maxLength={REPORT_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例：国道42号 田原交差点 渋滞 約1km"
        />
      </label>
      <div role="group" aria-label="位置" className="mb-2">
        <span className="mb-1 block px-1 text-[13px] text-label-2">位置</span>
        <Segmented<LocMode> ariaLabel="位置" className="flex w-full" value={loc} onChange={setLoc} options={options} />
      </div>
      {error && (
        <p className="px-1 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
