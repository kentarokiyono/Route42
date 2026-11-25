"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ModulePageHeader from "@/components/ModulePageHeader";
import Segmented from "@/components/ui/Segmented";
import { Field, Group, Row } from "@/components/ui/Grouped";
import { useStaff } from "@/components/StaffProvider";
import { useToast } from "@/components/Toast";
import { NOTICE_MAX } from "@/lib/backend";
import { clock } from "@/lib/format";
import { LAUNCH_LABEL, LAUNCH_ORDER } from "@/lib/levels";
import type { LaunchState, Mode, Role, StaffMember } from "@/lib/types";

function useRun() {
  const toast = useToast();
  return async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失敗しました");
      return false;
    }
  };
}

export default function SettingsPage() {
  const { isOwner, backend } = useStaff();
  return (
    <div className="mx-auto max-w-3xl">
      <ModulePageHeader title="配信設定" />
      {isOwner && <ModeSection />}
      {isOwner && <LaunchSection />}
      <NoticeSection />
      {isOwner && !backend.isDemo && <StaffSection />}
      {isOwner && backend.isDemo && <DemoSection />}
      <Group title="ほかの画面">
        <Row href="/ops/log">入力履歴</Row>
        <a href="/status" target="_blank" rel="noopener" className="flex min-h-[44px] items-center px-4 py-2.5 text-[15px] text-accent">
          一般向けの混雑情報ページ
        </a>
        <a href="/" target="_blank" rel="noopener" className="flex min-h-[44px] items-center px-4 py-2.5 text-[15px] text-accent">
          巡礼マップ（一般向け）
        </a>
      </Group>
    </div>
  );
}

function ModeSection() {
  const { live, backend } = useStaff();
  const run = useRun();
  return (
    <Group title="表示モード">
      <div className="px-4 py-3">
        <Segmented<Mode>
          ariaLabel="表示モード"
          className="flex w-full"
          value={live.mode}
          onChange={(m) => {
            const label = m === "launch" ? "打ち上げ" : "通常";
            if (window.confirm(`全利用者の表示を「${label}」モードに切り替えます。よろしいですか？`)) {
              run(() => backend.setMode(m), `${label}モードに切り替えました`);
            }
          }}
          options={[
            { value: "normal", label: "通常（巡礼）" },
            { value: "launch", label: "打ち上げ" },
          ]}
        />
      </div>
    </Group>
  );
}

function LaunchSection() {
  const { live, backend } = useStaff();
  const run = useRun();
  const [state, setState] = useState<LaunchState>(live.launch.state);
  const [time, setTime] = useState(live.launch.time);
  const [note, setNote] = useState(live.launch.note);
  const [dirty, setDirty] = useState(false);

  // 他の人が更新したら、編集中でなければ反映
  useEffect(() => {
    if (dirty) return;
    setState(live.launch.state);
    setTime(live.launch.time);
    setNote(live.launch.note);
  }, [live.launch, dirty]);

  async function save() {
    if ((state === "delayed" || state === "scrubbed") && !window.confirm(`「${LAUNCH_LABEL[state]}」を全利用者に配信します。よろしいですか？`)) return;
    if (await run(() => backend.setLaunch({ state, time, note: note.trim() }), "打ち上げ状況を配信しました")) setDirty(false);
  }

  return (
    <Group title="打ち上げ状況">
      <div className="space-y-3 px-4 py-3">
        <div role="radiogroup" aria-label="状況" className="grid grid-cols-3 gap-2 md:grid-cols-5">
          {LAUNCH_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={state === s}
              onClick={() => {
                setState(s);
                setDirty(true);
              }}
              className={`min-h-[44px] rounded-ios px-2 text-[14px] font-semibold ${state === s ? "bg-accent text-white" : "bg-fill text-label"}`}
            >
              {LAUNCH_LABEL[s]}
            </button>
          ))}
        </div>
        <Field label="予定日時">
          <input
            type="datetime-local"
            className="ios-input"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              setDirty(true);
            }}
          />
        </Field>
        <Field label="補足（任意）">
          <input
            className="ios-input"
            maxLength={80}
            value={note}
            placeholder="例：天候のため延期。次回は12/3 11:00予定"
            onChange={(e) => {
              setNote(e.target.value);
              setDirty(true);
            }}
          />
        </Field>
        <div className="flex gap-2">
          <button type="button" className="ios-btn-primary" onClick={save} disabled={!dirty}>
            配信
          </button>
          {dirty && (
            <button type="button" className="ios-btn-gray" onClick={() => setDirty(false)}>
              元に戻す
            </button>
          )}
        </div>
      </div>
    </Group>
  );
}

function NoticeSection() {
  const { live, backend } = useStaff();
  const run = useRun();
  const [text, setText] = useState(live.notice?.text ?? "");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setText(live.notice?.text ?? "");
  }, [live.notice, dirty]);

  return (
    <Group
      title="お知らせ（利用者の画面上部に表示）"
      action={live.notice ? <span className="text-label-2">{clock(live.notice.at)} {live.notice.by}</span> : undefined}
    >
      <div className="space-y-3 px-4 py-3">
        <textarea
          aria-label="お知らせ"
          className="ios-input min-h-[96px] resize-y"
          maxLength={NOTICE_MAX}
          value={text}
          placeholder="例：臨時駐車場Aは満車です。Bをご利用ください。"
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="ios-btn-primary"
            disabled={!text.trim() || !dirty}
            onClick={async () => {
              if (await run(() => backend.setNotice(text), "お知らせを配信しました")) setDirty(false);
            }}
          >
            配信
          </button>
          {live.notice && (
            <button
              type="button"
              className="ios-btn-gray text-danger"
              onClick={async () => {
                if (!window.confirm("お知らせを消しますか？")) return;
                if (await run(() => backend.setNotice(""), "お知らせを消しました")) setDirty(false);
              }}
            >
              消す
            </button>
          )}
        </div>
      </div>
    </Group>
  );
}

function StaffSection() {
  const { backend, me } = useStaff();
  const run = useRun();
  const [list, setList] = useState<StaffMember[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("staff");

  const load = () => backend.listStaff().then(setList).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);

  return (
    <Group title="職員（このメールアドレスでログインできる）">
      {list.map((m) => (
        <Row
          key={m.email}
          detail={
            m.email === me.email ? (
              "自分"
            ) : (
              <button
                type="button"
                className="text-[15px] text-danger"
                onClick={async () => {
                  if (!window.confirm(`${m.name} を削除しますか？`)) return;
                  if (await run(() => backend.removeStaff(m.email), "削除しました")) load();
                }}
              >
                削除
              </button>
            )
          }
        >
          <div>
            {m.name}
            <span className="ml-2 text-[13px] text-label-2">{m.role === "owner" ? "オーナー" : "職員"}</span>
          </div>
          <div className="break-all text-[13px] text-label-2">{m.email}</div>
        </Row>
      ))}
      <form
        className="space-y-3 px-4 py-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (role === "owner" && !window.confirm(`${name} をオーナー（全権限）として登録しますか？`)) return;
          if (await run(() => backend.upsertStaff({ email: email.trim().toLowerCase(), name: name.trim(), role }), "登録しました")) {
            setEmail("");
            setName("");
            setRole("staff");
            load();
          }
        }}
      >
        <Field label="メールアドレス" required>
          <input className="ios-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="表示名（部署名・班名を推奨）" required>
          <input className="ios-input" required maxLength={40} value={name} placeholder="例：串本町 観光課" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="権限" group>
          <Segmented<Role>
            ariaLabel="権限"
            className="flex w-full"
            value={role}
            onChange={setRole}
            options={[
              { value: "staff", label: "職員" },
              { value: "owner", label: "オーナー" },
            ]}
          />
        </Field>
        <button type="submit" className="ios-btn-primary">
          登録
        </button>
      </form>
    </Group>
  );
}

function DemoSection() {
  const { backend } = useStaff();
  const run = useRun();
  return (
    <Group title="デモ用データ（この端末のブラウザ内だけ）">
      <div className="flex flex-wrap gap-2 px-4 py-3">
        <button
          type="button"
          className="ios-btn-primary"
          onClick={() => {
            if (window.confirm("今のデモデータを消して、打ち上げ当日を想定したサンプルを入れます。よろしいですか？")) {
              run(() => backend.demoSeed!(), "サンプルデータを入れました");
            }
          }}
        >
          サンプルデータを入れる
        </button>
        <button
          type="button"
          className="ios-btn-gray text-danger"
          onClick={() => {
            if (window.confirm("デモデータをすべて消します。よろしいですか？")) run(() => backend.demoReset!(), "消しました");
          }}
        >
          すべて消す
        </button>
      </div>
      <Row>
        <Link href="/ops" className="text-accent">
          概要を見る
        </Link>
      </Row>
    </Group>
  );
}
