# backlog-form 設計

## 目的

Backlog アカウントを持たない**社外の人**が、Web フォームから Backlog に課題を登録できるようにする。
社内の人は Backlog で直接課題を追加すればよいので対象外。

## 基本方針

- **フォーム定義は Backlog のカスタム属性をそのまま使う**
  - 「プロジェクト × 課題種別」を 1 つのフォームとする
  - その種別に適用されているカスタム属性を、すべてフォーム項目として公開する
  - フォームの編集は Backlog の管理画面で行う。アプリ側に項目の定義は持たない
- **社外フォーム専用の課題種別を作る運用にする**
  - 「どの項目を公開するか」の制御を、種別への適用で Backlog 側に寄せる
  - 項目名・説明文はそのまま社外に表示されるため、社内向けの文言を書かない
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
| スタイル | Pico.css（CDN） | |
| テスト | `node:test` | |

## 構成

```
GET  /f/:slug  → 定義を取得（5 分キャッシュ）→ フォームを SSR
POST /f/:slug  → 定義を再取得（キャッシュを使わない）→ ハニーポット → Turnstile → 検証 → add_issue → 完了画面
```

```
src/
├── index.ts            # エントリポイント（起動処理）
├── app.ts              # Hono のルート。依存は外から注入（テストで差し替えるため）
├── config.ts           # 環境変数
├── forms.ts            # slug → { projectKey, issueTypeId, priorityId }
├── turnstile.ts
├── backlog/
│   ├── types.ts        # カスタム属性の型（typeId 1〜8）
│   ├── client.ts       # backlog-js のアダプタ
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
| 6 | 複数リスト | `select[multiple]` | `customField_{id}` を値の数だけ繰り返す |
| 7 | チェックボックス | `checkbox` のグループ | 同上 |
| 8 | ラジオ | `radio` のグループ | `customField_{id}` |
| （allowInput） | その他 | 追加のテキスト入力欄 | `customField_{id}_otherValue` |

標準項目のうち公開するのは**件名（必須）と詳細**だけ。優先度は `forms.ts` の固定値を使う（API で必須のため）。担当者などは設定しない。

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

- [ ] 複数値のカスタム属性を、同じキーの繰り返しで送る形式で正しく登録できるか、実際のスペースで確認する（公式ドキュメントに明記がない）
- [ ] `allowInput` がリスト系のどの型で返るか、また `_otherValue` と選択肢を同時に送れるかを確認する
- [ ] 日付の min / max が API からどの形式で返るかを確認する（現在は先頭 10 文字で比較している）
- [ ] 添付ファイル：`POST /space/attachment` → `attachmentId[]`（サイズ上限と拡張子の制限も入れる）
- [ ] 送信者への受付メール（「連絡先メール」のカスタム属性を使う）
- [ ] IP ごとのレート制限
- [ ] 種別に適用された必須のカスタム属性のうち、フォームで扱えないものを起動時に検出する
- [ ] デプロイ先の決定（Fly.io / Railway / Render など）
