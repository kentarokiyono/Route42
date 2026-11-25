"use client";

import { useState } from "react";
import OpsGate from "@/components/OpsGate";
import Sidebar from "@/components/Sidebar";
import StatusBar from "@/components/StatusBar";
import TabBar from "@/components/TabBar";
import AccountSheet from "@/components/AccountSheet";
import { ToastProvider } from "@/components/Toast";

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <OpsGate>
      <OpsShell>{children}</OpsShell>
    </OpsGate>
  );
}

function OpsShell({ children }: { children: React.ReactNode }) {
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-grouped">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <StatusBar onOpenAccount={() => setAccountOpen(true)} />
          {/* スマホは下部タブバーの分だけ余白を空ける */}
          <main className="flex-1 overflow-x-hidden px-4 pb-28 pt-4 text-label md:px-8 md:pb-10 md:pt-8">{children}</main>
        </div>
      </div>
      <TabBar />
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </ToastProvider>
  );
}
