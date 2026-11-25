"use client";

import { useEffect } from "react";

/** 電波が弱い現地でも画面を開けるよう Service Worker を登録（本番のみ） */
export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
