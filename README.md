# Route 42

南紀の巡礼マップと、ロケット打ち上げ時の混雑共有（串本町・那智勝浦町 職員向け＋一般向け）。

| ファイル | 対象 | 内容 |
|---|---|---|
| `Index.html` | 一般 | 巡礼マップ。混雑度表示。打ち上げモード中は `status.html` へ案内 |
| `status.html` | 一般 | 地図なしの軽量混雑ページ（打ち上げ状況・お知らせ・空いている順） |
| `staff.html` | 職員 | 職員マップ（混雑入力・現場報告） |
| `admin.html` | 職員 | 管理画面（ログイン・お知らせ・打ち上げ状況・モード切替・履歴・職員管理） |

| ファイル | 内容 |
|---|---|
| `data/spots.json` | 札所・見学場・駐車場データ |
| `data/route.json` | 巡礼ルートの事前計算結果（`tools/build-route.mjs` で生成） |
| `js/store.js` | データ層（Firebase / デモ） |
| `js/config.js` | Firebase 設定。`null` ならデモモード |
| `firestore.rules` | Firestore セキュリティルール |

## 権限

| 操作 | オーナー | 職員 | 一般 |
|---|---|---|---|
| 公開データ閲覧（`public/current`） | ○ | ○ | ○ |
| 職員データ閲覧（`live/current`、入力者名つき）・現場報告 | ○ | ○ | × |
| 混雑入力・お知らせ | ○ | ○ | × |
| 打ち上げ状況・モード切替・職員管理 | ○ | × | × |

両町共同運用（職員は全スポット入力可）。ルールは `firestore.rules` でサーバー側に強制。全操作は `logs` に記録。

## データ

- `live/current`: 職員用。リアルタイム購読（同時接続は職員数＝最大500程度）。
- `public/current`: 一般用。入力者名なし。職員の入力と同じバッチで更新。一般ページは SDK なしの REST で60秒ごとに取得。
- `reports/*`: 現場報告（300文字まで、位置は任意）。

## デモモード（Firebase 未設定）

`js/config.js` が `null` の間は、同じブラウザ内だけで動作する。

```
python3 -m http.server 8000
# http://localhost:8000/admin.html でログイン・入力
# → 別タブの staff.html（即時）/ status.html・Index.html（5秒ごと）に反映
```

ES モジュールのため `file://` では動かない。

## Firebase 本番設定

1. Firebase コンソールでプロジェクト作成（リージョン: `asia-northeast1`）。
2. Firestore Database を作成。
3. Authentication で「メール/パスワード」と「Google」を有効化。
4. プロジェクトの設定 > マイアプリ でウェブアプリを追加し、`firebaseConfig` を `js/config.js` に貼る。
5. ルールとホスティングを反映:
   ```
   npm i -g firebase-tools
   firebase login
   firebase use --add
   firebase deploy --only firestore:rules,firestore:indexes,hosting
   ```
6. 最初のオーナー登録（一度だけ、コンソールで手作業）:
   - `admin.html` に自分のアカウントでログイン → 表示されたユーザーIDを控える。
   - Firestore で `admins/<ユーザーID>` を作成: `name`（文字列）, `role` = `"owner"`。
   - `admin.html` を再読み込み → 「配信用データを作成」（`live/current` と `public/current` を作成）。
7. 職員の追加: 職員本人が `admin.html` にログイン → 表示されたIDをオーナーが「職員管理」で登録。
   メール/パスワードのアカウントは Authentication 画面でオーナーが作成して渡す。

## ルート事前計算

札所を変えたら実行し、`data/route.json` をコミット。利用者ごとの Directions API 呼び出しがなくなる。

```
MAPBOX_TOKEN=pk.xxx node tools/build-route.mjs
```

## 大量アクセス対策

- 一般向け `status.html` は地図・外部フォント・Firebase SDK なし。読み取りは60秒に1回。
- 一般からの書き込みはなし。
- `data/route.json` を置けば Directions API を呼ばない。
- `Index.html`（巡礼マップ）は Mapbox の地図読み込み課金対象。打ち上げ当日は `status.html` に誘導する。
- Mapbox トークンには URL 制限をかけること。
