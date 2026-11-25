/**
 * デモ用データ層。localStorage に保存し、同じブラウザのタブ間で同期する。
 * 他の人の画面には反映されない（説明・試用のため）。
 */
import { checkNoticeText, checkReportText, toPublic, type Backend } from "@/lib/backend";
import { isValidLevel } from "@/lib/levels";
import { LAUNCH, PILGRIM, ROADS, roadKey } from "@/lib/spots";
import { emptyLive, type Level, type LiveState, type LogEntry, type Me, type Report, type Role } from "@/lib/types";

const K_LIVE = "route42.demo.live";
const K_LOGS = "route42.demo.logs";
const K_REPORTS = "route42.demo.reports";
const K_ME = "route42.demo.me";

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境（プライベートブラウズ等）でも画面は動かす
  }
}
function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

function getLive(): LiveState {
  const l = read<LiveState | null>(K_LIVE, null);
  return l ? { ...emptyLive(), ...l } : emptyLive();
}

export function createDemoBackend(): Backend {
  const liveSubs = new Set<(l: LiveState) => void>();
  const logSubs = new Set<(l: LogEntry[]) => void>();
  const reportSubs = new Set<(r: Report[]) => void>();
  const meSubs = new Set<(m: Me | null) => void>();
  let me = read<Me | null>(K_ME, null);

  const openReports = () => read<(Report & { resolved?: boolean })[]>(K_REPORTS, []).filter((r) => !r.resolved);
  const emit = {
    live: () => liveSubs.forEach((f) => f(getLive())),
    logs: () => logSubs.forEach((f) => f(read<LogEntry[]>(K_LOGS, []))),
    reports: () => reportSubs.forEach((f) => f(openReports())),
    me: () => meSubs.forEach((f) => f(me)),
  };

  window.addEventListener("storage", (e) => {
    if (e.key === K_ME) {
      me = read<Me | null>(K_ME, null);
      emit.me();
    }
    if (e.key === K_LIVE || e.key === null) emit.live();
    if (e.key === K_LOGS || e.key === null) emit.logs();
    if (e.key === K_REPORTS || e.key === null) emit.reports();
  });

  function requireRole(roles: Role[]): Me {
    if (!me || !me.role || !roles.includes(me.role)) throw new Error("権限がありません");
    return me;
  }
  function log(action: string, target: string, value: unknown) {
    const logs = read<LogEntry[]>(K_LOGS, []);
    logs.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), actor: me?.name ?? "", action, target, value: String(value) });
    write(K_LOGS, logs.slice(0, 200));
    emit.logs();
  }
  function mutate(fn: (l: LiveState) => void, action: string, target: string, value: unknown) {
    const l = getLive();
    fn(l);
    l.updatedAt = Date.now();
    write(K_LIVE, l);
    log(action, target, value);
    emit.live();
  }

  const backend: Backend = {
    isDemo: true,

    onMe(cb) {
      meSubs.add(cb);
      cb(me);
      return () => meSubs.delete(cb);
    },
    async sendMagicLink() {
      throw new Error("デモモードではメールは送られません");
    },
    async demoSignIn(name, role) {
      me = { email: `${role}@demo.local`, name: name.trim() || (role === "owner" ? "オーナー" : "職員"), role };
      write(K_ME, me);
      emit.me();
    },
    async signOut() {
      me = null;
      remove(K_ME);
      emit.me();
    },

    async fetchPublic() {
      return toPublic(getLive());
    },

    subscribeLive(cb) {
      requireRole(["owner", "staff"]);
      liveSubs.add(cb);
      cb(getLive());
      return () => liveSubs.delete(cb);
    },
    subscribeReports(cb) {
      requireRole(["owner", "staff"]);
      reportSubs.add(cb);
      cb(openReports());
      return () => reportSubs.delete(cb);
    },
    subscribeLogs(cb) {
      requireRole(["owner", "staff"]);
      logSubs.add(cb);
      cb(read<LogEntry[]>(K_LOGS, []));
      return () => logSubs.delete(cb);
    },

    async setSpotLevel(spotId, level) {
      const u = requireRole(["owner", "staff"]);
      if (!isValidLevel(level)) throw new Error("不正な値です");
      mutate((l) => { l.spots[spotId] = { level, at: Date.now(), by: u.name }; }, "level", spotId, level);
    },
    async setRoadLevel(roadId, dir, level) {
      const u = requireRole(["owner", "staff"]);
      if (!isValidLevel(level) || !Number.isInteger(dir) || dir < 0 || dir > 1) throw new Error("不正な値です");
      const key = roadKey(roadId, dir);
      mutate((l) => { l.roads[key] = { level, at: Date.now(), by: u.name }; }, "road", key, level);
    },
    async setNotice(text) {
      const u = requireRole(["owner", "staff"]);
      const t = checkNoticeText(text);
      mutate((l) => { l.notice = t ? { text: t, at: Date.now(), by: u.name } : null; }, "notice", "", t);
    },
    async setMode(mode) {
      requireRole(["owner"]);
      mutate((l) => { l.mode = mode; }, "mode", "", mode);
    },
    async setLaunch(launch) {
      requireRole(["owner"]);
      mutate((l) => { l.launch = { ...launch }; }, "launch", launch.state, `${launch.time} ${launch.note}`.trim());
    },
    async addReport(text, coords) {
      const u = requireRole(["owner", "staff"]);
      const t = checkReportText(text);
      const list = read<(Report & { resolved?: boolean })[]>(K_REPORTS, []);
      const c = coords ? ([Number(coords[0].toFixed(5)), Number(coords[1].toFixed(5))] as [number, number]) : null;
      list.unshift({ id: `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`, text: t, coords: c, by: u.name, at: Date.now() });
      write(K_REPORTS, list.slice(0, 200));
      log("report", "", t);
      emit.reports();
    },
    async resolveReport(id) {
      requireRole(["owner", "staff"]);
      const list = read<(Report & { resolved?: boolean })[]>(K_REPORTS, []);
      const r = list.find((x) => x.id === id);
      if (!r) return;
      r.resolved = true;
      write(K_REPORTS, list);
      log("resolve", id, r.text);
      emit.reports();
    },

    async listStaff() {
      requireRole(["owner"]);
      return me ? [{ email: me.email, name: me.name, role: "owner" as const }] : [];
    },
    async upsertStaff() {
      throw new Error("デモモードでは職員を登録できません");
    },
    async removeStaff() {
      throw new Error("デモモードでは職員を削除できません");
    },

    async demoReset() {
      [K_LIVE, K_LOGS, K_REPORTS].forEach(remove);
      emit.live();
      emit.logs();
      emit.reports();
    },
    async demoSeed() {
      requireRole(["owner"]);
      await backend.demoReset!();
      const view = LAUNCH.filter((s) => s.kind === "viewing");
      const park = LAUNCH.filter((s) => s.kind === "parking");
      const vl: Level[] = [3, 0, 1];
      const pl: Level[] = [2, 0, 3];
      for (let i = 0; i < view.length; i++) await backend.setSpotLevel(view[i].id, vl[i % 3]);
      for (let i = 0; i < park.length; i++) await backend.setSpotLevel(park[i].id, pl[i % 3]);
      const rl: Level[][] = [[1, 0], [2, 1], [2, 0], [0, 0]];
      for (let i = 0; i < ROADS.length; i++) {
        for (let d = 0; d < ROADS[i].dirs.length; d++) await backend.setRoadLevel(ROADS[i].id, d, rl[i % 4][d] ?? 0);
      }
      if (PILGRIM[2]) await backend.setSpotLevel(PILGRIM[2].id, 2);
      if (PILGRIM[4]) await backend.setSpotLevel(PILGRIM[4].id, 0);
      if (park[2] && park[1]) await backend.setNotice(`${park[2].name}は満車です。${park[1].name}をご利用ください。`);
      const t = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const p2 = (n: number) => String(n).padStart(2, "0");
      await backend.setLaunch({ state: "countdown", time: `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}T${p2(t.getHours())}:00`, note: "" });
      await backend.setMode("launch");
      if (ROADS[1]) await backend.addReport(`${ROADS[1].name.replace("（仮）", "")} ${ROADS[1].dirs[0]} 渋滞 約1km`, ROADS[1].coords[1]);
      if (view[0]) await backend.addReport(`${view[0].name} 入口付近 歩行者が車道にはみ出し。誘導員の追加が必要`, [view[0].coords[0] + 0.002, view[0].coords[1] - 0.001]);
    },
  };
  return backend;
}
