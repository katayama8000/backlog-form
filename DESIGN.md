# backlog-form 設計

## 目的

Backlog アカウントを持たない**社外の人**が、Web フォームから Backlog に課題を登録できるようにする。
社内の人は Backlog で直接課題を追加すればよいので対象外。

## 基本方針

- **設定はすべて Backlog 側で行う。アプリには設定ファイルを持たない**
  - 「プロジェクト × 課題種別」を 1 つのフォームとする
  - フォームの編集は Backlog の管理画面で行う。アプリ側に項目の定義は持たない
- **公開してよいものは名前の先頭の `[form]` で示す**（Backlog に「公開」フラグがないため）
  - プロジェクト：`[form]` が付いていて、アーカイブされていないものだけを対象にする
  - 課題種別：`[form]` が付いたもの 1 つが 1 フォーム。残りの名前がフォームのタイトルになる
  - カスタム属性：種別に適用されていて、かつ `[form]` が付いたものだけを公開する
  - 表示するときは `[form]` を取り除く
  - 3 段階すべてオプトインなので、社内用の種別や属性がうっかり外に出ることはない
  - 印を付けた属性の名前・説明文はそのまま社外に表示されるため、社内向けの文言を書かない
- **サーバーは最小限にする**
  - API キーを社外に出さないためだけにサーバーを置く
  - SSR した HTML フォームと POST の 2 ルートのみ。JSON API や SPA は作らない

## 技術スタック

| 役割 | 採用 | メモ |
|---|---|---|
| ランタイム | Node.js 26 | 型を除去して `.ts` を直接実行するため、ビルド手順はない |
| 型チェック | TypeScript 7 | `tsc` は型チェック専用（`noEmit`）。`erasableSyntaxOnly` で enum などは使わない |
| Web | Hono + @hono/node-server | |
| HTML | `hono/html` のタグ付きテンプレート | JSX は Node の型除去では動かないため不採用。埋め込んだ値は自動でエスケープされる |
| Backlog API | [backlog-js](https://github.com/nulab/backlog-js) | 公式 SDK。`client.ts` で使う 4 つのエンドポイントだけを `BacklogClient` として包み、テストではこれを差し替える |
| バリデーション | 自前実装 | カスタム属性ごとの動的なルールとエラーメッセージを扱いやすいため |
| スパム対策 | ハニーポット + Cloudflare Turnstile（任意） | |
| スタイル | 自前の CSS（`render.ts` に埋め込み） | Backlog のブランドカラー（#42ce9f）に合わせる。白文字を載せるボタンなどは、コントラスト比 4.5:1 を保つため濃い緑（#16805e）を使う。ダークモード対応。外部 CDN に依存しない |
| テスト | `node:test` | |

## 構成

```
GET  /f/:projectKey/:issueTypeId  → 定義を取得（5 分キャッシュ）→ フォームを SSR
POST /f/:projectKey/:issueTypeId  → 定義を再取得（キャッシュを使わない）→ ハニーポット → Turnstile → 検証 → add_issue → 完了画面
```

定義の取得では、まずプロジェクトだけを取得して `[form]` の有無を確認する。印のないプロジェクトへのアクセスは API 呼び出し 1 回で済ませ、結果（見つからなかったことも含む）を 5 分キャッシュする。URL を課題種別の ID にしているのは、名前を変えても URL が変わらないようにするため。

```
```

```
src/
├── index.ts            # エントリポイント（起動処理）
├── app.ts              # Hono のルート。依存は外から注入（テストで差し替えるため）
├── config.ts           # 環境変数
├── turnstile.ts
├── backlog/
│   ├── types.ts        # カスタム属性の型（typeId 1〜8）
│   ├── client.ts       # backlog-js のアダプタ
│   ├── marker.ts       # `[form]` の判定と除去
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
| `BACKLOG_SPACE_URL` | ○ | 例：`https://example.backlog.com` |
| `BACKLOG_API_KEY` | ○ | 課題を作成するボットユーザーの API キー |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | | 両方設定すると Turnstile が有効になる |
| `PORT` | | 既定値は 3000 |

`.env` を置くと、`pnpm dev` / `pnpm start` 実行時に読み込まれる。

## 決めたこと・トレードオフ

- **非同期キューは入れない（MVP）**：送信の場で課題を作り、失敗したら入力内容を残したままエラーを表示する。件数が増えたり取りこぼしが問題になったら、`node:sqlite` などに送信内容を保存してリトライする形にする。
- **キャッシュはメモリ上**：1 プロセスで動かす前提。複数台にするなら共有ストアに移す。
- **ハニーポットに引っかかった送信は成功を装う**：bot に検知されたことを悟らせないため。

## 未確認 / TODO

- [x] 複数値のカスタム属性を、添字付きのキーで送って正しく登録できることを実際のスペースで確認した
- [x] チェックボックスで、選択肢と `_otherValue` を同時に送れることを確認した（他のリスト型の `allowInput` は未確認）
- [ ] 日付の min / max が API からどの形式で返るかを確認する（現在は先頭 10 文字で比較している）
- [ ] 添付ファイル：`POST /space/attachment` → `attachmentId[]`（サイズ上限と拡張子の制限も入れる）
- [ ] 送信者への受付メール（「連絡先メール」のカスタム属性を使う）
- [ ] IP ごとのレート制限
- [x] 種別に適用された必須のカスタム属性に `[form]` がない場合はフォームを読み込めないようにする（現状はアクセス時に 500。起動時の一覧チェックは未対応）
- [ ] デプロイ先の決定（Fly.io / Railway / Render など）
