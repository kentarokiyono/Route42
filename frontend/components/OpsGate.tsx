"use client";

import { useState } from "react";
import { StaffProvider } from "@/components/StaffProvider";
import Segmented from "@/components/ui/Segmented";
import { useBackend, useMe } from "@/lib/hooks";
import type { Role } from "@/lib/types";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-grouped p-6">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center">
        <h1 className="text-[22px] font-bold tracking-tight text-label">Route 42</h1>
        <p className="mt-1 text-[13px] text-label-2">串本町・那智勝浦町 職員用</p>
        {children}
      </div>
    </div>
  );
}

/** 職員画面の入口。ログイン → 職員名簿にあるかを確認してから中身を表示 */
export default function OpsGate({ children }: { children: React.ReactNode }) {
  const backend = useBackend();
  const { me, ready } = useMe(backend);

  if (!backend || !ready) {
    return (
      <Shell>
        <p className="mt-6 text-[15px] text-label-2">確認中…</p>
      </Shell>
    );
  }
  if (!me) return <Login demo={backend.isDemo} send={backend.sendMagicLink} demoSignIn={backend.demoSignIn} />;
  if (!me.role) {
    return (
      <Shell>
        <p className="mt-6 text-[15px] text-label">このメールアドレスは職員として登録されていません。</p>
        <p className="mt-2 break-all text-[13px] text-label-2">{me.email}</p>
        <p className="mt-2 text-[13px] text-label-2">オーナーに登録を依頼してください。</p>
        <button type="button" onClick={() => backend.signOut()} className="ios-btn-gray mt-5 w-full">
          別のアドレスでログイン
        </button>
      </Shell>
    );
  }
  return (
    <StaffProvider backend={backend} me={me}>
      {children}
    </StaffProvider>
  );
}

function Login({
  demo,
  send,
  demoSignIn,
}: {
  demo: boolean;
  send: (email: string) => Promise<void>;
  demoSignIn?: (name: string, role: Role) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("owner");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  if (demo && demoSignIn) {
    return (
      <Shell>
        <p className="mt-4 rounded-ios bg-p-orange px-3 py-2 text-left text-[13px] text-p-orange-ink">
          デモモードです。入力した内容はこの端末のブラウザ内にだけ保存されます。
        </p>
        <form
          className="mt-4 space-y-3 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            demoSignIn(name, role);
          }}
        >
          <label className="block">
            <span className="mb-1 block px-1 text-[13px] text-label-2">名前</span>
            <input className="ios-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="例：串本町 観光課" />
          </label>
          <div role="group" aria-label="権限">
            <span className="mb-1 block px-1 text-[13px] text-label-2">権限</span>
            <Segmented<Role>
              ariaLabel="権限"
              className="flex w-full"
              value={role}
              onChange={setRole}
              options={[
                { value: "owner", label: "オーナー" },
                { value: "staff", label: "職員" },
              ]}
            />
          </div>
          <button type="submit" className="ios-btn-primary w-full">
            ログイン
          </button>
        </form>
      </Shell>
    );
  }

  if (state === "sent") {
    return (
      <Shell>
        <p className="mt-6 text-[15px] text-label">ログイン用のリンクを送りました。</p>
        <p className="mt-2 break-all text-[13px] text-label-2">{email}</p>
        <p className="mt-2 text-[13px] text-label-2">メールのリンクを、この端末で開いてください。</p>
        <button type="button" onClick={() => setState("idle")} className="ios-btn-gray mt-5 w-full">
          メールアドレスを入れ直す
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <form
        className="mt-6 space-y-3 text-left"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setState("sending");
          try {
            await send(email);
            setState("sent");
          } catch (err) {
            setError(err instanceof Error ? err.message : "送れませんでした");
            setState("idle");
          }
        }}
      >
        <label className="block">
          <span className="mb-1 block px-1 text-[13px] text-label-2">メールアドレス</span>
          <input
            className="ios-input"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error && <p className="px-1 text-[13px] text-danger" role="alert">{error}</p>}
        <button type="submit" disabled={state === "sending"} className="ios-btn-primary w-full">
          {state === "sending" ? "送信中…" : "ログイン用のリンクを送る"}
        </button>
      </form>
    </Shell>
  );
}
