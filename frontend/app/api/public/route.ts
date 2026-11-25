/**
 * 一般向けの混雑情報（入力者名なし）。
 * 配信網（Vercel の CDN）に30秒保存するので、利用者が何万人いても Supabase への問い合わせは30秒に1回程度になる。
 */
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=0, s-maxage=30, stale-while-revalidate=60";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return Response.json({ error: "Supabase が未設定です（デモモード）" }, { status: 503 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("get_public_status");
  if (error || !data) {
    return Response.json({ error: "取得できませんでした" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(data, { headers: { "Cache-Control": CACHE, "CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
