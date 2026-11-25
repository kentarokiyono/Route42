// 混雑・打ち上げ情報のデータ層。
// FIREBASE_CONFIG があれば Firestore、なければ localStorage のデモ実装。
//
// データ:
//   live/current   職員専用（入力者名つき）。リアルタイム購読。
//   public/current 一般公開（入力者名なし）。REST で定期取得。
//   reports/*      職員の現場報告。
//   logs/*         入力履歴（追記のみ）。
//   admins/{uid}   { name, role: 'owner' | 'staff' }
import { FIREBASE_CONFIG } from './config.js';

// iOS システムカラー（白文字・白背景でも読める濃さの版）
export const LEVELS = [
    { label: '空き', short: '空', color: '#248a3d' },
    { label: '普通', short: '普', color: '#0071a4' },
    { label: 'やや混雑', short: '混', color: '#c93400' },
    { label: '混雑・満員', short: '満', color: '#d70015' }
];

export const ROAD_LEVELS = [
    { label: '順調', short: '順', color: '#248a3d' },
    { label: '混雑', short: '混', color: '#c93400' },
    { label: '渋滞', short: '渋', color: '#d70015' },
    { label: '通行止め', short: '止', color: '#1c1c1e' }
];

// 道路の入力キー: <区間ID>__<方向番号>
export function roadKey(roadId, dir) { return roadId + '__' + dir; }

export const LAUNCH_STATES = {
    scheduled: '打ち上げ予定',
    countdown: 'カウントダウン中',
    delayed: '延期',
    scrubbed: '中止',
    launched: '打ち上げ済み'
};

export const STALE_MIN = 60;
export const PUBLIC_POLL_MS = 60 * 1000;
export const REPORT_MAX = 300;

export function defaultLive() {
    return {
        mode: 'normal',
        launch: { state: 'scheduled', time: '', note: '' },
        spots: {},
        roads: {},
        notice: null,
        updatedAt: 0,
        exists: false
    };
}

export function isValidLevel(level) {
    return Number.isInteger(level) && level >= 0 && level < LEVELS.length;
}

// 古い情報・未入力は null
export function freshLevel(entry, now) {
    if (!entry || !isValidLevel(entry.level)) return null;
    if ((now || Date.now()) - entry.at > STALE_MIN * 60 * 1000) return null;
    return entry.level;
}

export function formatClock(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// "2026-12-01T11:00" → "12/1 11:00"
export function formatLaunchTime(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
    if (!m) return '';
    return Number(m[2]) + '/' + Number(m[3]) + ' ' + m[4] + ':' + m[5];
}

function normalizeLive(d, toMs) {
    const base = defaultLive();
    if (!d) return base;
    const spots = {};
    Object.keys(d.spots || {}).forEach(function (k) {
        const s = d.spots[k];
        if (s && isValidLevel(s.level)) spots[k] = { level: s.level, at: toMs(s.at), by: s.by || '' };
    });
    const roads = {};
    Object.keys(d.roads || {}).forEach(function (k) {
        const s = d.roads[k];
        if (s && isValidLevel(s.level)) roads[k] = { level: s.level, at: toMs(s.at), by: s.by || '' };
    });
    const l = d.launch || {};
    return {
        mode: d.mode === 'launch' ? 'launch' : 'normal',
        launch: {
            state: LAUNCH_STATES[l.state] ? l.state : 'scheduled',
            time: typeof l.time === 'string' ? l.time : '',
            note: typeof l.note === 'string' ? l.note : ''
        },
        spots: spots,
        roads: roads,
        notice: d.notice && d.notice.text ? { text: String(d.notice.text), at: toMs(d.notice.at), by: d.notice.by || '' } : null,
        updatedAt: toMs(d.updatedAt),
        exists: true
    };
}

// 公開用には入力者名を含めない
function toPublic(l) {
    const strip = function (src) {
        const o = {};
        Object.keys(src || {}).forEach(function (k) { o[k] = { level: src[k].level, at: src[k].at }; });
        return o;
    };
    return {
        mode: l.mode,
        launch: l.launch,
        spots: strip(l.spots),
        roads: strip(l.roads),
        notice: l.notice ? { text: l.notice.text, at: l.notice.at } : null,
        updatedAt: l.updatedAt
    };
}

export async function createStore() {
    return FIREBASE_CONFIG ? createFirebaseStore(FIREBASE_CONFIG) : createDemoStore();
}

function requireRole(user, roles) {
    if (!user || roles.indexOf(user.role) === -1) throw new Error('権限がありません');
}

function checkReport(r) {
    const text = String(r.text || '').trim();
    if (!text) throw new Error('報告内容が空です');
    if (text.length > REPORT_MAX) throw new Error(REPORT_MAX + '文字以内にしてください');
    let coords = null;
    if (Array.isArray(r.coords) && r.coords.length === 2 && r.coords.every(Number.isFinite)) {
        coords = [Number(r.coords[0].toFixed(5)), Number(r.coords[1].toFixed(5))];
    }
    return { text: text, coords: coords };
}

// 定期取得の共通処理。止めるには戻り値を呼ぶ。
function poller(fetchOnce, cb, onError, ms) {
    let stopped = false, timer = null;
    async function tick() {
        try { const v = await fetchOnce(); if (!stopped) cb(v); }
        catch (e) { if (!stopped && onError) onError(e); }
        if (!stopped) timer = setTimeout(tick, ms);
    }
    function onVisible() {
        if (document.visibilityState === 'visible' && !stopped) { clearTimeout(timer); tick(); }
    }
    document.addEventListener('visibilitychange', onVisible);
    tick();
    return function () { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
}

/* ---------------- デモ実装（localStorage、同じブラウザのタブ間で同期） ---------------- */
function createDemoStore() {
    const K_LIVE = 'route42.demo.live';
    const K_LOGS = 'route42.demo.logs';
    const K_USER = 'route42.demo.user';
    const K_REPORTS = 'route42.demo.reports';
    const read = function (k, d) {
        try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
    };
    const write = function (k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存不可 */ }
    };
    const subs = { live: new Set(), logs: new Set(), auth: new Set(), reports: new Set() };
    let user = read(K_USER, null);

    const num = function (t) { return typeof t === 'number' ? t : 0; };
    const getLive = function () { const raw = read(K_LIVE, null); return raw ? normalizeLive(raw, num) : defaultLive(); };
    const getReports = function () { return read(K_REPORTS, []); };
    const emit = {
        live: function () { const l = getLive(); subs.live.forEach(function (f) { f(l); }); },
        logs: function () { const g = read(K_LOGS, []); subs.logs.forEach(function (f) { f(g); }); },
        reports: function () { const r = getReports().filter(function (x) { return !x.resolved; }); subs.reports.forEach(function (f) { f(r); }); }
    };

    window.addEventListener('storage', function (e) {
        if (e.key === K_USER) { user = read(K_USER, null); subs.auth.forEach(function (f) { f(user); }); }
        if (e.key === K_LIVE || e.key === null) emit.live();
        if (e.key === K_LOGS || e.key === null) emit.logs();
        if (e.key === K_REPORTS || e.key === null) emit.reports();
    });

    function addLog(action, target, value) {
        const g = read(K_LOGS, []);
        g.unshift({ uid: user.uid, name: user.name, action: action, target: target, value: String(value), at: Date.now() });
        write(K_LOGS, g.slice(0, 200));
        emit.logs();
    }
    function mutate(fn, log) {
        const l = getLive();
        fn(l);
        l.updatedAt = Date.now();
        delete l.exists;
        write(K_LIVE, l);
        addLog(log.action, log.target, log.value);
        emit.live();
    }

    return {
        isDemo: true,
        // 一般向け（定期取得）
        pollPublic: function (cb, onError) {
            return poller(async function () { return toPublic(getLive()); }, cb, onError, 5000);
        },
        // 職員向け（リアルタイム）
        subscribeLive: function (cb) {
            requireRole(user, ['owner', 'staff']);
            subs.live.add(cb);
            cb(getLive());
            return function () { subs.live.delete(cb); };
        },
        onAuth: function (cb) {
            subs.auth.add(cb);
            cb(user);
            return function () { subs.auth.delete(cb); };
        },
        demoSignIn: async function (name, role) {
            user = { uid: 'demo-' + role + '-' + name, name: name, role: role === 'owner' ? 'owner' : 'staff', email: '' };
            write(K_USER, user);
            subs.auth.forEach(function (f) { f(user); });
        },
        signOut: async function () {
            user = null;
            try { localStorage.removeItem(K_USER); } catch (e) { /* noop */ }
            subs.auth.forEach(function (f) { f(null); });
        },
        ensureLive: async function () { /* デモでは不要 */ },
        // デモ: 全データ消去（ログイン状態は残す）
        demoReset: async function () {
            [K_LIVE, K_LOGS, K_REPORTS].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } });
            emit.live(); emit.logs(); emit.reports();
        },
        setSpotLevel: async function (spotId, level) {
            requireRole(user, ['owner', 'staff']);
            if (!isValidLevel(level)) throw new Error('不正な値');
            mutate(function (l) { l.spots[spotId] = { level: level, at: Date.now(), by: user.name }; },
                { action: 'level', target: spotId, value: level });
        },
        setRoadLevel: async function (roadId, dir, level) {
            requireRole(user, ['owner', 'staff']);
            if (!isValidLevel(level) || !Number.isInteger(dir) || dir < 0 || dir > 1) throw new Error('不正な値');
            const key = roadKey(roadId, dir);
            mutate(function (l) { l.roads[key] = { level: level, at: Date.now(), by: user.name }; },
                { action: 'road', target: key, value: level });
        },
        setNotice: async function (text) {
            requireRole(user, ['owner', 'staff']);
            mutate(function (l) { l.notice = text ? { text: text, at: Date.now(), by: user.name } : null; },
                { action: 'notice', target: '', value: text });
        },
        setMode: async function (mode) {
            requireRole(user, ['owner']);
            mutate(function (l) { l.mode = mode === 'launch' ? 'launch' : 'normal'; },
                { action: 'mode', target: '', value: mode });
        },
        setLaunch: async function (launch) {
            requireRole(user, ['owner']);
            mutate(function (l) { l.launch = { state: launch.state, time: launch.time, note: launch.note }; },
                { action: 'launch', target: launch.state, value: launch.time + ' ' + launch.note });
        },
        addReport: async function (r) {
            requireRole(user, ['owner', 'staff']);
            const v = checkReport(r);
            const list = getReports();
            list.unshift({ id: 'r' + Date.now() + Math.random().toString(36).slice(2, 6), text: v.text, coords: v.coords,
                uid: user.uid, name: user.name, at: Date.now(), resolved: false });
            write(K_REPORTS, list.slice(0, 200));
            addLog('report', '', v.text);
            emit.reports();
        },
        resolveReport: async function (id) {
            requireRole(user, ['owner', 'staff']);
            const list = getReports();
            const r = list.find(function (x) { return x.id === id; });
            if (!r) return;
            r.resolved = true; r.resolvedBy = user.name; r.resolvedAt = Date.now();
            write(K_REPORTS, list);
            addLog('resolve', id, r.text);
            emit.reports();
        },
        subscribeReports: function (cb) {
            requireRole(user, ['owner', 'staff']);
            subs.reports.add(cb);
            cb(getReports().filter(function (x) { return !x.resolved; }));
            return function () { subs.reports.delete(cb); };
        },
        subscribeLogs: function (cb) {
            subs.logs.add(cb);
            cb(read(K_LOGS, []));
            return function () { subs.logs.delete(cb); };
        },
        subscribeAdmins: null,
        setAdmin: null,
        removeAdmin: null
    };
}

/* ---------------- Firestore REST の値を JS に変換（公開ページ用、SDK 不要） ---------------- */
function decodeValue(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return Date.parse(v.timestampValue);
    if ('nullValue' in v) return null;
    if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
    return null;
}
function decodeFields(f) {
    const o = {};
    Object.keys(f).forEach(function (k) { o[k] = decodeValue(f[k]); });
    return o;
}

/* ---------------- Firebase 実装 ---------------- */
async function createFirebaseStore(cfg) {
    const restUrl = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(cfg.projectId) +
        '/databases/(default)/documents/public/current?key=' + encodeURIComponent(cfg.apiKey);
    const num = function (t) { return typeof t === 'number' ? t : 0; };

    // 公開ページは SDK を読み込まない（軽量化）
    async function fetchPublic() {
        const r = await fetch(restUrl, { cache: 'no-store' });
        if (r.status === 404) return toPublic(defaultLive());
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        return toPublic(normalizeLive(decodeFields(j.fields || {}), num));
    }

    let sdk = null;
    async function loadSdk() {
        if (sdk) return sdk;
        const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
        const mods = await Promise.all([
            import(base + 'firebase-app.js'),
            import(base + 'firebase-firestore.js'),
            import(base + 'firebase-auth.js')
        ]);
        const app = mods[0].initializeApp(cfg);
        sdk = { fs: mods[1], au: mods[2], db: mods[1].getFirestore(app), auth: mods[2].getAuth(app) };
        sdk.liveRef = sdk.fs.doc(sdk.db, 'live', 'current');
        sdk.pubRef = sdk.fs.doc(sdk.db, 'public', 'current');
        return sdk;
    }

    let user = null;
    const toMs = function (t) {
        if (t && typeof t.toMillis === 'function') return t.toMillis();
        if (typeof t === 'number') return t;
        return Date.now(); // サーバー時刻の確定前
    };

    // live / public / logs を1バッチで更新。pairs: [[フィールド, live値, public値], ...]
    async function commit(pairs, log) {
        const s = await loadSdk(), fs = s.fs;
        const b = fs.writeBatch(s.db);
        const liveArgs = [], pubArgs = [];
        pairs.forEach(function (p) {
            const path = Array.isArray(p[0]) ? new fs.FieldPath(p[0][0], p[0][1]) : p[0];
            liveArgs.push(path, p[1]);
            pubArgs.push(path, p[2]);
        });
        liveArgs.push('updatedAt', fs.serverTimestamp());
        pubArgs.push('updatedAt', fs.serverTimestamp());
        b.update.apply(b, [s.liveRef].concat(liveArgs));
        b.update.apply(b, [s.pubRef].concat(pubArgs));
        b.set(fs.doc(fs.collection(s.db, 'logs')), {
            uid: user.uid, name: user.name,
            action: log.action, target: log.target, value: String(log.value),
            at: fs.serverTimestamp()
        });
        await b.commit();
    }

    const store = {
        isDemo: false,
        pollPublic: function (cb, onError) { return poller(fetchPublic, cb, onError, PUBLIC_POLL_MS); },
        subscribeLive: function (cb, onError) {
            let unsub = function () {};
            let stopped = false;
            loadSdk().then(function (s) {
                if (stopped) return;
                unsub = s.fs.onSnapshot(s.liveRef,
                    function (snap) { cb(normalizeLive(snap.exists() ? snap.data() : null, toMs)); },
                    function (e) { if (onError) onError(e); });
            });
            return function () { stopped = true; unsub(); };
        },
        onAuth: function (cb) {
            let unsub = function () {};
            loadSdk().then(function (s) {
                unsub = s.au.onAuthStateChanged(s.auth, async function (u) {
                    if (!u) { user = null; cb(null); return; }
                    let role = null, name = u.displayName || u.email || '';
                    try {
                        const a = await s.fs.getDoc(s.fs.doc(s.db, 'admins', u.uid));
                        if (a.exists()) { role = a.data().role || null; name = a.data().name || name; }
                    } catch (e) { /* 権限なし */ }
                    user = { uid: u.uid, email: u.email || '', name: name, role: role };
                    cb(user);
                });
            });
            return function () { unsub(); };
        },
        signInEmail: async function (email, pw) { const s = await loadSdk(); return s.au.signInWithEmailAndPassword(s.auth, email, pw); },
        signInGoogle: async function () { const s = await loadSdk(); return s.au.signInWithPopup(s.auth, new s.au.GoogleAuthProvider()); },
        signOut: async function () { const s = await loadSdk(); return s.au.signOut(s.auth); },
        ensureLive: async function () {
            requireRole(user, ['owner']);
            const s = await loadSdk(), fs = s.fs;
            const d = defaultLive();
            delete d.exists;
            const pl = await fs.getDoc(s.liveRef);
            if (!pl.exists()) await fs.setDoc(s.liveRef, Object.assign({}, d, { updatedAt: fs.serverTimestamp() }));
            const pp = await fs.getDoc(s.pubRef);
            if (!pp.exists()) await fs.setDoc(s.pubRef, Object.assign({}, d, { updatedAt: fs.serverTimestamp() }));
        },
        setSpotLevel: async function (spotId, level) {
            requireRole(user, ['owner', 'staff']);
            if (!isValidLevel(level)) throw new Error('不正な値');
            const fs = (await loadSdk()).fs;
            await commit([[['spots', spotId],
                { level: level, at: fs.serverTimestamp(), by: user.name },
                { level: level, at: fs.serverTimestamp() }]],
                { action: 'level', target: spotId, value: level });
        },
        setRoadLevel: async function (roadId, dir, level) {
            requireRole(user, ['owner', 'staff']);
            if (!isValidLevel(level) || !Number.isInteger(dir) || dir < 0 || dir > 1) throw new Error('不正な値');
            const key = roadKey(roadId, dir);
            const fs = (await loadSdk()).fs;
            await commit([[['roads', key],
                { level: level, at: fs.serverTimestamp(), by: user.name },
                { level: level, at: fs.serverTimestamp() }]],
                { action: 'road', target: key, value: level });
        },
        setNotice: async function (text) {
            requireRole(user, ['owner', 'staff']);
            const fs = (await loadSdk()).fs;
            await commit([['notice',
                text ? { text: text, at: fs.serverTimestamp(), by: user.name } : null,
                text ? { text: text, at: fs.serverTimestamp() } : null]],
                { action: 'notice', target: '', value: text });
        },
        setMode: async function (mode) {
            requireRole(user, ['owner']);
            const m = mode === 'launch' ? 'launch' : 'normal';
            await commit([['mode', m, m]], { action: 'mode', target: '', value: m });
        },
        setLaunch: async function (launch) {
            requireRole(user, ['owner']);
            const v = { state: launch.state, time: launch.time, note: launch.note };
            await commit([['launch', v, v]], { action: 'launch', target: launch.state, value: launch.time + ' ' + launch.note });
        },
        addReport: async function (r) {
            requireRole(user, ['owner', 'staff']);
            const v = checkReport(r);
            const s = await loadSdk(), fs = s.fs;
            const b = fs.writeBatch(s.db);
            b.set(fs.doc(fs.collection(s.db, 'reports')), {
                text: v.text, coords: v.coords, uid: user.uid, name: user.name,
                at: fs.serverTimestamp(), resolved: false
            });
            b.set(fs.doc(fs.collection(s.db, 'logs')), {
                uid: user.uid, name: user.name, action: 'report', target: '', value: v.text, at: fs.serverTimestamp()
            });
            await b.commit();
        },
        resolveReport: async function (id) {
            requireRole(user, ['owner', 'staff']);
            const s = await loadSdk(), fs = s.fs;
            const b = fs.writeBatch(s.db);
            b.update(fs.doc(s.db, 'reports', id), { resolved: true, resolvedBy: user.name, resolvedAt: fs.serverTimestamp() });
            b.set(fs.doc(fs.collection(s.db, 'logs')), {
                uid: user.uid, name: user.name, action: 'resolve', target: id, value: '', at: fs.serverTimestamp()
            });
            await b.commit();
        },
        subscribeReports: function (cb) {
            let unsub = function () {}, stopped = false;
            loadSdk().then(function (s) {
                if (stopped) return;
                const fs = s.fs;
                const q = fs.query(fs.collection(s.db, 'reports'), fs.where('resolved', '==', false), fs.orderBy('at', 'desc'), fs.limit(50));
                unsub = fs.onSnapshot(q, function (snap) {
                    cb(snap.docs.map(function (d) { const x = d.data(); x.id = d.id; x.at = toMs(x.at); return x; }));
                }, function () { cb([]); });
            });
            return function () { stopped = true; unsub(); };
        },
        subscribeLogs: function (cb) {
            let unsub = function () {}, stopped = false;
            loadSdk().then(function (s) {
                if (stopped) return;
                const fs = s.fs;
                const q = fs.query(fs.collection(s.db, 'logs'), fs.orderBy('at', 'desc'), fs.limit(50));
                unsub = fs.onSnapshot(q, function (snap) {
                    cb(snap.docs.map(function (d) { const x = d.data(); x.at = toMs(x.at); return x; }));
                }, function () { cb([]); });
            });
            return function () { stopped = true; unsub(); };
        },
        subscribeAdmins: function (cb) {
            let unsub = function () {}, stopped = false;
            loadSdk().then(function (s) {
                if (stopped) return;
                unsub = s.fs.onSnapshot(s.fs.collection(s.db, 'admins'), function (snap) {
                    cb(snap.docs.map(function (d) { const x = d.data(); x.uid = d.id; return x; }));
                }, function () { cb([]); });
            });
            return function () { stopped = true; unsub(); };
        },
        setAdmin: async function (uid, name, role) {
            requireRole(user, ['owner']);
            const s = await loadSdk();
            await s.fs.setDoc(s.fs.doc(s.db, 'admins', uid), { name: name, role: role === 'owner' ? 'owner' : 'staff' });
        },
        removeAdmin: async function (uid) {
            requireRole(user, ['owner']);
            if (uid === user.uid) throw new Error('自分自身は削除できません');
            const s = await loadSdk();
            await s.fs.deleteDoc(s.fs.doc(s.db, 'admins', uid));
        }
    };
    return store;
}
