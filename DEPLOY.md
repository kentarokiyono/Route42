# 運用ガイド（構成・設定値・初回セットアップ・保守）

## 1. 構成

| 役割 | サービス | 備考 |
|---|---|---|
| 画面＋一般向け API | Vercel（Root Directory: `frontend`） | `main` を自動デプロイ |
| データベース・ログイン・即時反映 | Supabase（東京リージョン推奨） | Auth はメールのリンク、Realtime は職員画面のみ |
| 地図 | Mapbox | 公開トークン（URL 制限をかける） |

サーバー（Python 等）は無い。書き込みは Supabase の関数（rpc）経由で、権限確認と履歴の記録はデータベース側で行う。

### 大量アクセスの考え方

- 一般向け（`/` `/status`）は `/api/public` を60秒ごとに取得。`/api/public` は Vercel の配信網に30秒保存（`s-maxage=30`）するので、利用者が何万人いても Supabase への問い合わせは30秒に1回程度。
- `/status` は地図・外部フォント・Supabase のライブラリを読み込まない。
- 職員画面だけが Supabase Realtime に接続（同時接続は職員数ぶん。Supabase の無料枠は200、Pro は500）。
- `/` は Mapbox の地図読み込み課金の対象。打ち上げ当日は `/status` に誘導する。

## 2. 設定値

### フロント（`frontend/.env.production` または Vercel の環境変数）

ブラウザに配られる公開値だけを置く。

| 名前 | 内容 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase の Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の anon / publishable キー（service_role は置かない） |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox の公開トークン（`pk.`） |

Supabase の2つが空ならデモモード。

### Supabase（Authentication）

- Sign In / Providers: **Email を有効**（パスワードは使わない。メールのリンクでログイン）
- URL Configuration
  - Site URL: 本番 URL
  - Redirect URLs: 本番URL の `/ops`、`http://localhost:3000/ops`
- メール送信: 職員が増える場合は SMTP（独自の送信元）を設定する（Supabase 標準の送信は1時間あたりの上限が小さい）

## 3. 初回セットアップ

1. Supabase でプロジェクトを作る。
2. SQL Editor に `schema.sql` を全部貼って実行（何度実行しても安全）。
3. 同じ SQL Editor で最初のオーナーを登録（`schema.sql` 末尾のコメント参照）:
   ```sql
   insert into staff (email, name, role) values ('you@example.com', 'あなたの名前', 'owner')
     on conflict (email) do update set role = 'owner';
   ```
4. Authentication の設定（2章）。
5. Vercel でリポジトリを取り込み、Root Directory を `frontend` にして環境変数を設定。
6. 本番 URL の `/ops` でメールアドレスを入れてログイン → 届いたリンクを開く。
7. 職員の追加: 配信設定 →「職員」でメールアドレス・表示名・権限を登録。本人は `/ops` からログインする。

## 4. 保守

- データベースの変更: `schema.sql` を直して SQL Editor で再実行。
- スポット・区間の変更: `frontend/data/spots.json` を直してデプロイ。巡礼スポットを変えたら `tools/build-route.mjs` を実行して `frontend/public/data/route.json` を更新。
- 入力から60分以上たった混雑度は「情報なし」として扱う（`frontend/lib/levels.ts` の `STALE_MIN`）。
