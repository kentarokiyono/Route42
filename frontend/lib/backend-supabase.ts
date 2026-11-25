/**
 * Supabase 用データ層。
 * - 書き込みは schema.sql の関数（rpc）経由。権限確認と履歴の記録はデータベース側で行う。
 * - 職員画面は Realtime で即時反映（変更通知を受けたら小さな表を読み直す）。
 * - 一般向けは /api/public（配信網で30秒キャッシュ）から取得する。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkNoticeText, checkReportText, normalizeLive, type Backend } from "@/lib/backend";
import type { Entry, Level, LiveState, LogEntry, Me, Report, Role } from "@/lib/types";

const ms = (t: string | null | undefined): number => (t ? Date.parse(t) : 0);

function client(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

/** エラーを日本語の Error にそろえる */
function fail(e: { message?: string } | null): never {
  throw new Error(e?.message || "通信に失敗しました");
}

/** 変更通知が続けて来ても読み直しを1回にまとめる */
function debounce(fn: () => void, wait = 250) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, wait);
  };
}

export function createSupabaseBackend(): Backend {
  const sb = client();
  let channelSeq = 0;

  /** テーブルの変更を購読し、変更・再接続・画面復帰のたびに load を呼ぶ */
  function watch(tables: string[], load: () => void): () => void {
    const reload = debounce(load);
    let ch = sb.channel(`route42-${tables.join("-")}-${++channelSeq}`);
    tables.forEach((table) => {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, reload);
    });
    ch.subscribe((state) => {
      if (state === "SUBSCRIBED") load();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      sb.removeChannel(ch);
    };
  }

  async function loadMe(email: string): Promise<Me> {
    const { data } = await sb.from("staff").select("name, role").eq("email", email.toLowerCase()).maybeSingle();
    return { email, name: data?.name ?? email, role: (data?.role as Role | undefined) ?? null };
  }

  async function rpc(name: string, args: Record<string, unknown>) {
    const { error } = await sb.rpc(name, args);
    if (error) fail(error);
  }

  return {
    isDemo: false,

    onMe(cb) {
      let alive = true;
      const emit = async (email: string | undefined) => {
        const me = email ? await loadMe(email) : null;
        if (alive) cb(me);
      };
      sb.auth.getSession().then(({ data }) => emit(data.session?.user.email));
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        if (event === "INITIAL_SESSION") return; // getSession で処理済み
        emit(session?.user.email);
      });
      return () => {
        alive = false;
        data.subscription.unsubscribe();
      };
    },
    async sendMagicLink(email) {
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/ops`, shouldCreateUser: true },
      });
      if (error) fail(error);
    },
    async signOut() {
      await sb.auth.signOut();
    },

    async fetchPublic() {
      const r = await fetch("/api/public", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return normalizeLive(await r.json());
    },

    subscribeLive(cb, onError) {
      const load = async () => {
        const [st, sp, rd] = await Promise.all([
          sb.from("status").select("*").eq("id", 1).maybeSingle(),
          sb.from("spot_levels").select("*"),
          sb.from("road_levels").select("*"),
        ]);
        const err = st.error || sp.error || rd.error;
        if (err) {
          onError?.(new Error(err.message));
          return;
        }
        const s = st.data ?? {};
        const toEntry = (row: { level: number; updated_at: string; updated_by: string }): Entry => ({
          level: row.level as Level,
          at: ms(row.updated_at),
          by: row.updated_by,
        });
        const live: LiveState = {
          mode: s.mode === "launch" ? "launch" : "normal",
          launch: { state: s.launch_state ?? "scheduled", time: s.launch_time ?? "", note: s.launch_note ?? "" },
          notice: s.notice_text ? { text: s.notice_text, at: ms(s.notice_at), by: s.notice_by ?? "" } : null,
          spots: Object.fromEntries((sp.data ?? []).map((r) => [r.spot_id, toEntry(r)])),
          roads: Object.fromEntries((rd.data ?? []).map((r) => [r.road_key, toEntry(r)])),
          updatedAt: ms(s.updated_at),
        };
        cb(live);
      };
      return watch(["status", "spot_levels", "road_levels"], load);
    },
    subscribeReports(cb) {
      const load = async () => {
        const { data, error } = await sb
          .from("reports")
          .select("id, text, lng, lat, created_by, created_at")
          .eq("resolved", false)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) return;
        cb(
          (data ?? []).map(
            (r): Report => ({
              id: r.id,
              text: r.text,
              coords: r.lng != null && r.lat != null ? [r.lng, r.lat] : null,
              by: r.created_by,
              at: ms(r.created_at),
            })
          )
        );
      };
      return watch(["reports"], load);
    },
    subscribeLogs(cb) {
      const load = async () => {
        const { data, error } = await sb.from("logs").select("*").order("at", { ascending: false }).limit(50);
        if (error) return;
        cb(
          (data ?? []).map(
            (r): LogEntry => ({ id: String(r.id), at: ms(r.at), actor: r.actor, action: r.action, target: r.target, value: r.value })
          )
        );
      };
      return watch(["logs"], load);
    },

    setSpotLevel: (spotId, level) => rpc("set_spot_level", { p_spot: spotId, p_level: level }),
    setRoadLevel: (roadId, dir, level) => rpc("set_road_level", { p_road: roadId, p_dir: dir, p_level: level }),
    setNotice: (text) => rpc("set_notice", { p_text: checkNoticeText(text) }),
    setMode: (mode) => rpc("set_mode", { p_mode: mode }),
    setLaunch: (l) => rpc("set_launch", { p_state: l.state, p_time: l.time, p_note: l.note }),
    addReport: (text, coords) =>
      rpc("add_report", { p_text: checkReportText(text), p_lng: coords ? coords[0] : null, p_lat: coords ? coords[1] : null }),
    resolveReport: (id) => rpc("resolve_report", { p_id: id }),

    async listStaff() {
      const { data, error } = await sb.from("staff").select("email, name, role").order("created_at");
      if (error) fail(error);
      return (data ?? []) as { email: string; name: string; role: Role }[];
    },
    upsertStaff: (m) => rpc("upsert_staff", { p_email: m.email, p_name: m.name, p_role: m.role }),
    removeStaff: (email) => rpc("remove_staff", { p_email: email }),
  };
}
