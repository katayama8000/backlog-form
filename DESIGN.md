# backlog-form 設計

## 目的

Web フォームから Backlog に課題を登録できるようにする。
送信する人は Backlog アカウントがなくてもよく、社内・社外を問わない。決まった項目を埋めてもらう問い合わせ・申請の窓口として使う。

## 登場人物

| 人 | すること |
|---|---|
| 運用者 | このアプリを Cloudflare Workers にデプロイする。OAuth アプリを登録して環境変数・シークレットに設定する |
| フォームを作る人 | どのスペースの Backlog ユーザーでもよい。OAuth でログインし、プロジェクト・課題種別・表示するカスタム属性を選んでフォームを公開する |
| 送信する人 | フォームの URL を知っている人なら誰でも（社内・社外、Backlog アカウントの有無を問わない）。URL を開いて入力するだけ |

## 基本方針

- **項目の定義は Backlog のカスタム属性をそのまま使う**
  - 「プロジェクト × 課題種別」を 1 つのフォームとする
  - アプリに保存するのは「どの種別のどの属性を出すか」だけ。属性の名前・種類・選択肢・必須は毎回 Backlog から読む
  - 属性の追加や選択肢の変更は Backlog の画面で行う（アプリからの作成は将来の検討事項）
- **公開は明示的に選んだものだけ**
  - フォームを作る人が、管理画面でプロジェクト・課題種別・属性を選ぶ。選んでいない属性は外に出ない
  - ただし種別に適用された**必須の属性は常に表示する**。Backlog が必須の属性なしでは課題を作らないため
  - 属性の名前・説明文はフォームを開いた人にそのまま表示される
- **認証は Backlog の OAuth 2.0**
  - フォームを作る人は API キーを発行・共有しなくてよい。やめるときは Backlog 側でアプリの許可を取り消せる
  - 送信する人はログインしないので、課題はフォームを作った人のトークンで作る（作成者はその人になる）
- **サーバーは最小限にする**
  - SSR した HTML だけで作る。JSON API や SPA は作らない
  - JavaScript は二重送信の防止・エラー項目へのフォーカス・URL のコピーだけに使う。無効でもすべての機能が動く

## 技術スタック

| 役割 | 採用 | メモ |
|---|---|---|
| ランタイム | 本番は Cloudflare Workers、ローカルは Node.js 24 | Node では型を除去して `.ts` を直接実行する（ビルド手順なし）。Workers 向けには wrangler がまとめる。無料プランで動く |
| 型チェック | TypeScript 7 | `tsc` は型チェック専用（`noEmit`）。`erasableSyntaxOnly` で enum などは使わない |
| Web | Hono（Node では @hono/node-server） | |
| HTML | `hono/html` のタグ付きテンプレート | JSX は Node の型除去では動かないため不採用。埋め込んだ値は自動でエスケープされる |
| Backlog API | [backlog-js](https://github.com/nulab/backlog-js) | 公式 SDK。API 呼び出しと OAuth 2.0 の両方に使う。`client.ts` で `BacklogClient` として包み、テストではこれを差し替える |
| 保存先 | SQLite（本番は Durable Object 1 つ、ローカルは `node:sqlite`） | 接続（トークン）・セッション・フォーム設定。SQL は共通で、`SqlDriver` で差し替える |
| バリデーション | 自前実装 | カスタム属性ごとの動的なルールとエラーメッセージを扱いやすいため |
| スパム対策 | ハニーポット + Cloudflare Turnstile（任意） | |
| スタイル | 自前の CSS（`layout.ts` に埋め込み） | Backlog のブランドカラー（#42ce9f）に合わせる。白文字を載せるボタンなどは、コントラスト比 4.5:1 を保つため濃い緑（#16805e）を使う。ダークモード対応。外部 CDN に依存しない |
| テスト | `node:test` | DB はインメモリの SQLite を使う |

## ルート

```
# フォームを作る人
GET  /                      ログイン画面（ログイン済みなら /forms へ）
POST /login                 スペースを受け取り、Backlog の認可画面へリダイレクト
GET  /oauth/callback        コードをトークンに交換 → 接続を保存 → セッション発行
POST /logout
GET  /forms                 自分のフォーム一覧
GET  /forms/new             作成ウィザード（?projectId → ?projectId&issueTypeId の 3 段階）
POST /forms                 作成
GET  /forms/:id             設定の表示と公開 URL
POST /forms/:id             更新
POST /forms/:id/delete      削除

# 送信する人
GET  /f/:formId             定義を取得（5 分キャッシュ）→ フォームを SSR。入力名と同じクエリ（?summary=…&cf_10=…）があれば初期値にする
POST /f/:formId             定義を再取得（キャッシュを使わない）→ ハニーポット → Turnstile → 検証 → add_issue → 完了画面
```

フォームの ID は推測できないランダムな文字列にする。スペースやプロジェクトキーを URL に出さず、URL を総当たりで探されないようにするため。

## データ

| テーブル | 中身 |
|---|---|
| `connections` | OAuth で許可した Backlog ユーザー（スペース × ユーザー ID で一意）。アクセストークンとリフレッシュトークンは AES-256-GCM で暗号化して保存する |
| `sessions` | 管理画面のログイン。Cookie にはランダムなトークン、DB にはそのハッシュだけを保存する（30 日） |
| `forms` | フォーム設定。接続 ID・プロジェクト ID・課題種別 ID・タイトル・表示する属性 ID・件名を自動で付けるか・公開するかどうか |

フォームは作った人の接続に属する。同じスペースの別のユーザーからは見えず、編集もできない。

## トークンの扱い

- アクセストークンは 1 時間で切れるので、期限の 1 分前からリフレッシュトークンで更新する
- 同じ接続への同時リクエストで更新が重複しないよう、更新処理は接続ごとに 1 つにまとめる
- API が 401 を返したら、1 度だけ更新してやり直す
- 更新自体が拒否されたら（許可の取り消しなど）、接続に「再ログインが必要」の印を付ける。その人のフォームは「現在ご利用いただけません」（503）になり、管理画面ではログインし直すよう案内する

## 秘密情報

`APP_SECRET` 1 つから、HKDF で用途別の鍵（トークンの暗号化用・Cookie の署名用）を作る。運用者が管理する秘密を 1 つにするため。変えると全員がログアウトし、保存済みのトークンも読めなくなる。

## セキュリティ

- **CSRF**：すべての POST で `Origin` を `APP_URL` と照合する（Hono の `csrf` ミドルウェア）。Cookie は `SameSite=Lax`、`HttpOnly`、HTTPS なら `Secure`
- **OAuth の state**：ログイン開始時にランダムな state とスペースを署名付き Cookie に入れ、コールバックで照合する
- **スペースのホスト**：`*.backlog.com` / `*.backlog.jp` / `*.backlogtool.com` だけを受け付ける。任意のサーバーに認可コードや Client Secret を送らないため
- **所有者のチェック**：管理画面のフォーム操作は、ログイン中の接続が持つフォームだけを対象にする。作成時もプロジェクトと課題種別にアクセスできるかを Backlog で確認し直す

## 構成

```
src/
├── index.ts            # Node のエントリポイント（ローカル開発用）
├── worker.ts           # Cloudflare のエントリポイントと Durable Object
├── setup.ts            # 依存の組み立て（Node と Workers で共通）
├── backend.ts          # 保存とトークン更新の窓口（すべて非同期。Workers では Durable Object の中で動く）
├── node-sqlite.ts      # node:sqlite 用の SqlDriver
├── app.ts              # 公開フォームのルート、CSRF、エラー処理。依存は外から注入（テストで差し替えるため）
├── config.ts           # 環境変数
├── crypto.ts           # 鍵の導出、暗号化、ランダム ID
├── store.ts            # SQL（接続・セッション・フォーム）。SqlDriver の上で動く
├── layout.ts           # 共通の HTML レイアウトと CSS
├── turnstile.ts
├── admin/
│   ├── routes.ts       # ログイン、OAuth コールバック、フォームの管理
│   └── render.ts       # 管理画面の HTML
├── backlog/
│   ├── types.ts        # カスタム属性の型（typeId 1〜8）
│   ├── client.ts       # backlog-js のアダプタとトークンの更新
│   ├── oauth.ts        # OAuth 2.0 とスペースのホストの検証
│   └── schema.ts       # フォーム定義の取得とキャッシュ
└── form/
    ├── input.ts        # input の name 規約と FormData の正規化
    ├── validate.ts     # カスタム属性 → 検証
    ├── render.ts       # カスタム属性 → HTML
    └── to-issue.ts     # 検証済みの値 → add_issue のパラメータ
```

`render.ts` と `validate.ts` は、どちらも同じ `CustomField[]` から作る。こうすることで、表示と検証の内容がずれない。

## カスタム属性とフォーム部品の対応

| typeId | 種類 | フォーム部品 | 送信パラメータ |
|---|---|---|---|
| 1 | 文字列 | `input[type=text]` | `customField_{id}` |
| 2 | 文章 | `textarea` | `customField_{id}` |
| 3 | 数値 | `input[type=number]`（min / max / 単位） | `customField_{id}` |
| 4 | 日付 | `input[type=date]`（min / max） | `customField_{id}`（`yyyy-MM-dd`） |
| 5 | 単一リスト | `select` | `customField_{id}` = 選択肢の ID |
| 6 | 複数リスト | `select[multiple]` | `customField_{id}[0]`, `customField_{id}[1]`, …（backlog-js が配列を展開） |
| 7 | チェックボックス | `checkbox` のグループ | 同上 |
| 8 | ラジオ | `radio` のグループ | `customField_{id}` |
| （allowInput） | その他 | 追加のテキスト入力欄 | `customField_{id}_otherValue` |

標準項目のうち公開するのは**件名（必須）と詳細**だけ。優先度は「中」（ID 3）で固定する（API で必須のため）。担当者などは設定しない。

## 環境変数

| 名前 | 必須 | 説明 |
|---|---|---|
| `APP_URL` | ○ | 公開 URL。OAuth のリダイレクト URI は `${APP_URL}/oauth/callback` |
| `APP_SECRET` | ○ | 32 文字以上のランダムな文字列 |
| `BACKLOG_CLIENT_ID` / `BACKLOG_CLIENT_SECRET` | ○ | 登録した OAuth アプリのもの |
| `DATABASE_PATH` | | Node のみ。既定値は `data/backlog-form.db` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | | 両方設定すると Turnstile が有効になる |
| `PORT` | | 既定値は 3000 |

`.env` を置くと、`pnpm dev` / `pnpm start` 実行時に読み込まれる。
Cloudflare では `APP_URL` を `wrangler.jsonc` の `vars` に、それ以外を `wrangler secret put` で設定する（`DATABASE_PATH` と `PORT` は使わない）。`pnpm cf:dev` では `.dev.vars` を読む。

## 決めたこと・トレードオフ

- **非同期キューは入れない（MVP）**：送信の場で課題を作り、失敗したら入力内容を残したままエラーを表示する。件数が増えたり取りこぼしが問題になったら、送信内容を SQLite に保存してリトライする形にする。
- **状態は Durable Object 1 つに集める**：Workers は同時に複数の isolate で動くが、保存とトークン更新は 1 つの Durable Object を通すので、書き手は常に 1 つになる。Backlog はリフレッシュトークンを更新のたびに変えるため、更新が並ぶとどちらかが失敗して作成者がログアウト扱いになる。これを防ぐのが主な理由。D1 は安いが、この排他を別に作る必要があるので採らなかった。
- **フォーム定義のキャッシュは isolate ごと**：フォームの設定を保存したら、キャッシュはその設定と食い違うので次のアクセスで取り直す。Backlog 側の変更は最大 5 分遅れる。
- **ハニーポットに引っかかった送信は成功を装う**：bot に検知されたことを悟らせないため。
- **課題の作成者はフォームを作った人**：OAuth にはボットユーザーの概念がないため。名前を出したくない場合は、専用のアカウントでログインしてもらう。
- **`[form]` の目印は廃止した**：以前は名前の先頭に `[form]` を付けたものを公開していたが、管理画面で選ぶ方式に置き換えた。

## 未確認 / TODO

- [ ] Backlog の OAuth アプリで、`http://localhost` のリダイレクト URI を登録できるか確認する
- [ ] `backlog.jp` / `backlogtool.com` のスペースが、`backlog.com` で登録した 1 つの OAuth アプリでログインできるか確認する
- [ ] リフレッシュトークンに有効期限があるか、更新のたびに変わるかを確認する（現在は返ってきたものを毎回保存している）
- [ ] カスタム属性をアプリから作れるようにするか決める
- [x] 複数値のカスタム属性を、添字付きのキーで送って正しく登録できることを実際のスペースで確認した
- [x] チェックボックスで、選択肢と `_otherValue` を同時に送れることを確認した（他のリスト型の `allowInput` は未確認）
- [ ] 日付の min / max が API からどの形式で返るかを確認する（現在は先頭 10 文字で比較している）
- [ ] 添付ファイル：`POST /space/attachment` → `attachmentId[]`（サイズ上限と拡張子の制限も入れる）
- [ ] 送信者への受付メール（「連絡先メール」のカスタム属性を使う）
- [ ] IP ごとのレート制限
- [x] デプロイ先は Cloudflare Workers + Durable Object（無料プラン）
- [ ] 本番で 1 リクエストの CPU 時間が無料プランの 10 ms に収まるか確認する
