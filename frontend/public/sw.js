/*
 * Route42 の Service Worker（電波が弱い現地のため）。
 * - 画面と静的ファイル: ネット優先、失敗したら前回の内容
 * - /api/public: ネット優先、失敗したら前回の内容（一般向けの混雑情報）
 * - 職員のデータ（Supabase）と地図は扱わない
 */
const VERSION = "v1";
const CACHE = `route42-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/status"])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 職員画面は常に最新を取りに行く（古い画面で入力させない）
  if (url.pathname.startsWith("/ops")) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || Response.error()))
  );
});
