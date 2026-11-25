// 電波が弱い現地でもページを開けるようにする Service Worker。
// 同じサイトのファイルは「ネット優先・失敗したら保存版」。外部（地図・Firebase）は扱わない。
const CACHE = 'route42-v1';
const SHELL = [
    'Index.html', 'status.html', 'staff.html', 'admin.html', 'dashboard.html',
    'js/store.js', 'js/config.js', 'js/sw-register.js', 'data/spots.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    e.respondWith(
        fetch(req)
            .then((res) => {
                if (res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
                }
                return res;
            })
            .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || Response.error()))
    );
});
