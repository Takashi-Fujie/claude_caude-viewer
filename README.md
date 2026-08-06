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

## 開発

```bash
npm run verify       # commit 前ゲート（typecheck → lint → test:unit）
npm run spec:check   # Spec ↔ ソースの乖離検査
npm run test:watch   # テスト watch
```

開発フローと設計上の判断は [AGENTS.md](./AGENTS.md)、仕様は [docs/spec/](./docs/spec/) を参照。

## エージェント設定

複数のコーディングエージェントで併用できるよう [AGENTS.md 標準](https://agents.md)と [Agent Skills 標準](https://agentskills.io)に合わせている。

- `AGENTS.md` が正本。`CLAUDE.md` はシンボリックリンク（Claude Code 用）
- スキルの正本はツール中立の `skills/<name>/SKILL.md`。`.claude/skills` と `.codex/skills` はどちらもそこへのシンボリックリンク
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
