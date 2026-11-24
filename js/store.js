// 混雑・打ち上げ情報のデータ層。
// FIREBASE_CONFIG があれば Firestore、なければ localStorage のデモ実装を使う。
import { FIREBASE_CONFIG } from './config.js';

export const LEVELS = [
    { label: '空き', short: '空', color: '#2a7f6f' },
    { label: '普通', short: '普', color: '#8a6d1f' },
    { label: 'やや混雑', short: '混', color: '#b35a16' },
    { label: '混雑・満員', short: '満', color: '#8f2a1e' }
];

export const LAUNCH_STATES = {
    scheduled: '打ち上げ予定',
    countdown: 'カウントダウン中',
    delayed: '延期',
    scrubbed: '中止',
    launched: '打ち上げ済み'
};

export const STALE_MIN = 60;

export function defaultLive() {
    return {
        mode: 'normal',
        launch: { state: 'scheduled', time: '', note: '' },
        spots: {},
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
    const l = d.launch || {};
    return {
        mode: d.mode === 'launch' ? 'launch' : 'normal',
        launch: {
            state: LAUNCH_STATES[l.state] ? l.state : 'scheduled',
            time: typeof l.time === 'string' ? l.time : '',
            note: typeof l.note === 'string' ? l.note : ''
        },
        spots: spots,
        notice: d.notice && d.notice.text ? { text: String(d.notice.text), at: toMs(d.notice.at), by: d.notice.by || '' } : null,
        updatedAt: toMs(d.updatedAt),
        exists: true
    };
}

export async function createStore() {
    return FIREBASE_CONFIG ? createFirebaseStore(FIREBASE_CONFIG) : createDemoStore();
}

function requireRole(user, roles) {
    if (!user || roles.indexOf(user.role) === -1) throw new Error('権限がありません');
}

/* ---------------- デモ実装（localStorage、同じブラウザのタブ間で同期） ---------------- */
function createDemoStore() {
    const K_LIVE = 'route42.demo.live';
    const K_LOGS = 'route42.demo.logs';
    const K_USER = 'route42.demo.user';
    const read = function (k, d) {
        try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
    };
    const write = function (k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存不可 */ }
    };
    const liveSubs = new Set(), logSubs = new Set(), authSubs = new Set();
    let user = read(K_USER, null);

    const getLive = function () {
        const raw = read(K_LIVE, null);
        return raw ? normalizeLive(raw, function (t) { return typeof t === 'number' ? t : 0; }) : defaultLive();
    };
    const emitLive = function () { const l = getLive(); liveSubs.forEach(function (f) { f(l); }); };
    const emitLogs = function () { const g = read(K_LOGS, []); logSubs.forEach(function (f) { f(g); }); };

    window.addEventListener('storage', function (e) {
        if (e.key === K_USER) { user = read(K_USER, null); authSubs.forEach(function (f) { f(user); }); }
        if (e.key === K_LIVE || e.key === null) emitLive();
        if (e.key === K_LOGS || e.key === null) emitLogs();
    });

    function mutate(fn, log) {
        const l = getLive();
        fn(l);
        l.updatedAt = Date.now();
        delete l.exists;
        write(K_LIVE, l);
        const g = read(K_LOGS, []);
        g.unshift({ uid: user.uid, name: user.name, action: log.action, target: log.target, value: String(log.value), at: Date.now() });
        write(K_LOGS, g.slice(0, 200));
        emitLive();
        emitLogs();
    }

    return {
        isDemo: true,
        subscribeLive: function (cb) {
            liveSubs.add(cb);
            cb(getLive());
            return function () { liveSubs.delete(cb); };
        },
        onAuth: function (cb) {
            authSubs.add(cb);
            cb(user);
            return function () { authSubs.delete(cb); };
        },
        demoSignIn: async function (name, role) {
            user = { uid: 'demo-' + role + '-' + name, name: name, role: role === 'owner' ? 'owner' : 'staff', email: '' };
            write(K_USER, user);
            authSubs.forEach(function (f) { f(user); });
        },
        signOut: async function () {
            user = null;
            try { localStorage.removeItem(K_USER); } catch (e) { /* noop */ }
            authSubs.forEach(function (f) { f(null); });
        },
        ensureLive: async function () { /* デモでは不要 */ },
        setSpotLevel: async function (spotId, level) {
            requireRole(user, ['owner', 'staff']);
            if (!isValidLevel(level)) throw new Error('不正な値');
            mutate(function (l) { l.spots[spotId] = { level: level, at: Date.now(), by: user.name }; },
                { action: 'level', target: spotId, value: level });
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
        subscribeLogs: function (cb) {
            logSubs.add(cb);
            cb(read(K_LOGS, []));
            return function () { logSubs.delete(cb); };
        },
        subscribeAdmins: null,
        setAdmin: null,
        removeAdmin: null
    };
}

/* ---------------- Firebase 実装 ---------------- */
async function createFirebaseStore(cfg) {
    const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    const mods = await Promise.all([
        import(base + 'firebase-app.js'),
        import(base + 'firebase-firestore.js'),
        import(base + 'firebase-auth.js')
    ]);
    const appM = mods[0], fs = mods[1], au = mods[2];
    const app = appM.initializeApp(cfg);
    const db = fs.getFirestore(app);
    const auth = au.getAuth(app);
    const liveRef = fs.doc(db, 'live', 'current');
    let user = null;

    const toMs = function (t) {
        if (t && typeof t.toMillis === 'function') return t.toMillis();
        if (typeof t === 'number') return t;
        return Date.now(); // サーバー時刻の確定前
    };

    // live 更新とログ書き込みを1バッチで
    async function commit(update, log) {
        const b = fs.writeBatch(db);
        update.updatedAt = fs.serverTimestamp();
        b.update(liveRef, update);
        b.set(fs.doc(fs.collection(db, 'logs')), {
            uid: user.uid, name: user.name,
            action: log.action, target: log.target, value: String(log.value),
            at: fs.serverTimestamp()
        });
        await b.commit();
    }

    return {
        isDemo: false,
        subscribeLive: function (cb, onError) {
            return fs.onSnapshot(liveRef,
                function (s) { cb(normalizeLive(s.exists() ? s.data() : null, toMs)); },
                function (e) { if (onError) onError(e); });
        },
        onAuth: function (cb) {
            return au.onAuthStateChanged(auth, async function (u) {
                if (!u) { user = null; cb(null); return; }
                let role = null, name = u.displayName || u.email || '';
                try {
                    const a = await fs.getDoc(fs.doc(db, 'admins', u.uid));
                    if (a.exists()) { role = a.data().role || null; name = a.data().name || name; }
                } catch (e) { /* 権限なし */ }
                user = { uid: u.uid, email: u.email || '', name: name, role: role };
                cb(user);
            });
        },
        signInEmail: function (email, pw) { return au.signInWithEmailAndPassword(auth, email, pw); },
        signInGoogle: function () { return au.signInWithPopup(auth, new au.GoogleAuthProvider()); },
        signOut: function () { return au.signOut(auth); },
        ensureLive: async function () {
            requireRole(user, ['owner']);
            const s = await fs.getDoc(liveRef);
            if (!s.exists()) {
                const d = defaultLive();
                delete d.exists;
                d.updatedAt = fs.serverTimestamp();
                await fs.setDoc(liveRef, d);
            }
        },
        setSpotLevel: async function (spotId, level) {
            requireRole(user, ['owner', 'staff']);
            if (!isValidLevel(level)) throw new Error('不正な値');
            await commitField(['spots', spotId], { level: level, at: fs.serverTimestamp(), by: user.name },
                { action: 'level', target: spotId, value: level });
        },
        setNotice: async function (text) {
            requireRole(user, ['owner', 'staff']);
            await commit({ notice: text ? { text: text, at: fs.serverTimestamp(), by: user.name } : null },
                { action: 'notice', target: '', value: text });
        },
        setMode: async function (mode) {
            requireRole(user, ['owner']);
            await commit({ mode: mode === 'launch' ? 'launch' : 'normal' }, { action: 'mode', target: '', value: mode });
        },
        setLaunch: async function (launch) {
            requireRole(user, ['owner']);
            await commit({ launch: { state: launch.state, time: launch.time, note: launch.note } },
                { action: 'launch', target: launch.state, value: launch.time + ' ' + launch.note });
        },
        subscribeLogs: function (cb) {
            const q = fs.query(fs.collection(db, 'logs'), fs.orderBy('at', 'desc'), fs.limit(50));
            return fs.onSnapshot(q, function (s) {
                cb(s.docs.map(function (d) { const x = d.data(); x.at = toMs(x.at); return x; }));
            }, function () { cb([]); });
        },
        subscribeAdmins: function (cb) {
            return fs.onSnapshot(fs.collection(db, 'admins'), function (s) {
                cb(s.docs.map(function (d) { const x = d.data(); x.uid = d.id; return x; }));
            }, function () { cb([]); });
        },
        setAdmin: async function (uid, name, role) {
            requireRole(user, ['owner']);
            await fs.setDoc(fs.doc(db, 'admins', uid), { name: name, role: role === 'owner' ? 'owner' : 'staff' });
        },
        removeAdmin: async function (uid) {
            requireRole(user, ['owner']);
            if (uid === user.uid) throw new Error('自分自身は削除できません');
            await fs.deleteDoc(fs.doc(db, 'admins', uid));
        }
    };

    // 入れ子フィールド（spots.<id>）を FieldPath で更新
    async function commitField(path, value, log) {
        const b = fs.writeBatch(db);
        b.update(liveRef, new fs.FieldPath(path[0], path[1]), value, 'updatedAt', fs.serverTimestamp());
        b.set(fs.doc(fs.collection(db, 'logs')), {
            uid: user.uid, name: user.name,
            action: log.action, target: log.target, value: String(log.value),
            at: fs.serverTimestamp()
        });
        await b.commit();
    }
}
