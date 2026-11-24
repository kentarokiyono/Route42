# Route 42

南紀の巡礼マップ。ロケット打ち上げ時の混雑マップ（打ち上げモード）付き。

| ファイル | 内容 |
|---|---|
| `Index.html` | 利用者用マップ |
| `admin.html` | 管理画面（混雑入力・お知らせ・打ち上げ状況・モード切替） |
| `data/spots.json` | 札所・見学場・駐車場データ |
| `data/route.json` | 巡礼ルートの事前計算結果（`tools/build-route.mjs` で生成） |
| `js/store.js` | データ層（Firebase / デモ） |
| `js/config.js` | Firebase 設定。`null` ならデモモード |
| `firestore.rules` | Firestore セキュリティルール |

## 権限

| 操作 | オーナー | 職員 |
|---|---|---|
| 混雑入力・お知らせ | ○ | ○ |
| 打ち上げ状況・モード切替・職員管理 | ○ | × |

ルールは `firestore.rules` でサーバー側に強制。全操作は `logs` に記録。

## デモモード（Firebase 未設定）

`js/config.js` が `null` の間は、同じブラウザ内だけで動作する。

```
python3 -m http.server 8000
# http://localhost:8000/admin.html で入力 → 別タブの http://localhost:8000/Index.html に反映
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
   firebase deploy --only firestore:rules,hosting
   ```
6. 最初のオーナー登録（一度だけ、コンソールで手作業）:
   - `admin.html` に自分のアカウントでログイン → 表示されたユーザーIDを控える。
   - Firestore で `admins/<ユーザーID>` を作成: `name`（文字列）, `role` = `"owner"`。
   - `admin.html` を再読み込み → 「配信用データを作成」。
7. 職員の追加: 職員本人が `admin.html` にログイン → 表示されたIDをオーナーが「職員管理」で登録。
   メール/パスワードのアカウントは Authentication 画面でオーナーが作成して渡す。

## ルート事前計算

札所を変えたら実行し、`data/route.json` をコミット。利用者ごとの Directions API 呼び出しがなくなる。

```
MAPBOX_TOKEN=pk.xxx node tools/build-route.mjs
```

## 大量アクセス（同時5万人想定）への対策

- 利用者が購読するのは `live/current` の1ドキュメントのみ。書き込みは管理者だけ。
- 打ち上げモードでは利用者からの書き込みなし。
- `data/route.json` を置けば Directions API を呼ばない。
- Mapbox の地図読み込みは従量課金。打ち上げ前に料金と上限を確認すること。
- Mapbox トークンには URL 制限をかけること。
