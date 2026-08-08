# coding_agent-viewer

コーディングエージェントの活動ログを可視化するローカル Web アプリ。まず `~/.claude/` 配下の Claude Code ログを対象に実装し、完了後に Codex CLI のログ対応を追加する。

- **チャット閲覧・検索** — セッションの会話を整形表示し、横断検索する
- **トークン / コスト統計** — モデル別・プロジェクト別・日次の消費量と推定コスト、キャッシュ効率
- **ツール / MCP 利用状況** — ツール別呼び出し回数、MCP サーバ別内訳、失敗率
- **Agent / Skill 利用状況** — 定義一覧と実際の起動回数の突き合わせ（未使用エージェントの検出）

進行中セッションはファイル監視でリロードなしに反映される。

## 前提

- Node.js 22 以上
- 読み取り対象は実行ユーザーの `~/.claude/`

## セットアップ

```bash
npm install
```

## 使い方

```bash
npm run build:web    # フロントエンドをビルド（web/dist）
npm run serve        # http://127.0.0.1:4517 で起動（PORT 環境変数で変更可）
```

ブラウザで `http://127.0.0.1:4517` を開く。画面は 5 つ:

| 画面 | 内容 |
|---|---|
| Overview | 期間別の総コスト・総トークン・日次チャート・プロジェクト一覧・全文検索 |
| プロジェクト | 日次モデル別チャートとセッション一覧（Overview からドリルダウン） |
| セッション分析 | 会話の整形表示・やりとり別コスト・ツール/MCP 利用状況・ライブ更新 |
| Tools & Agents | ツール別ランキング・失敗率・MCP 内訳・hook 履歴・未使用エージェント検出 |
| 設定・定義 | agents / skills / plugins / settings / プロンプト履歴の可視化 |

フロントエンドを触る開発中は `npm run dev:web`（Vite dev server・API は 4517 へプロキシ）。

## 開発

```bash
npm run verify       # commit 前ゲート（typecheck → lint → test:unit → test:e2e → report）
npm run spec:check   # Spec ↔ ソースの乖離検査
npm run test:watch   # ユニットテスト watch
npm run test:e2e     # Playwright E2E（合成フィクスチャのみ。実ログには触れない）
```

E2E は `tests/e2e/support/seed.ts` が `.cache/e2e/` に合成ログ・合成 `~/.claude` 相当を敷いて検証する。初回は `npx playwright install chromium` が必要。

開発フローと設計上の判断は [AGENTS.md](./AGENTS.md)、仕様は [docs/spec/](./docs/spec/) を参照。

## エージェント設定

複数のコーディングエージェントで併用できるよう [AGENTS.md 標準](https://agents.md)と [Agent Skills 標準](https://agentskills.io)に合わせている。

- `AGENTS.md` が正本。`CLAUDE.md` はシンボリックリンク（Claude Code 用）
- スキルの正本は標準配置の `.agents/skills/<name>/SKILL.md`（Codex CLI は直接走査）。`.claude/skills` はそこへのシンボリックリンク（Claude Code 用）
- スキル: `issue-create`（Issue 作成まで）/ `dev-cycle`（ブランチ作成〜PR〜クローズ）/ `project-review`（このリポジトリ固有のレビュー観点）

## 設計方針

- 最大 69MB / 1 行平均 50KB の JSONL を**全読み込みせず**、byte offset 付きでストリーム走査する
- インデックスは軽量メタのみ保持し、全文は表示時に offset で seek して読む
- 追記前提の増分更新（差分バイトのみ再解析）
- サーバは `127.0.0.1` のみに bind。認証なし・外部公開しない
- ログソースと viewer の間に正規化 DTO の中間層を置き、Claude 固有の解釈はパーサ側に閉じ込める（将来の Codex CLI 対応で viewer 側を変えないため）

## コストについて

表示されるコストは**推定値**である。単価は `server/pricing.json` に切り出してあり、必要に応じて編集できる。価格表に無いモデルは 0 円ではなく警告として扱う。

## セキュリティ

このリポジトリは public だが、読み取るログは開発者個人の全作業履歴である。ログ本文・プロジェクトパス・`settings.json` の permissions 実値はリポジトリに含めない。テストフィクスチャは匿名化した合成データのみ。

## ライセンス

未定
