# coding_agent-viewer

コーディングエージェントの活動ログを可視化するローカル Web アプリ。まず Claude Code（`~/.claude/` 配下のセッション JSONL・エージェント定義・スキル・プラグイン・設定）を対象に実装し、**Claude Code 分の完了後に Codex CLI のログ対応を追加する**。

## エージェント設定の構成（AGENTS.md 標準）

複数のコーディングエージェント（Claude Code / Codex CLI 等）で併用するため、[AGENTS.md 標準](https://agents.md)と [Agent Skills 標準](https://agentskills.io)に合わせている。

- **この `AGENTS.md` が正本。** `CLAUDE.md` はここへのシンボリックリンク（Claude Code は AGENTS.md を直接読まないため）
- スキルの正本は `.claude/skills/<name>/SKILL.md`。`.codex/skills` はそこへのシンボリックリンク（Codex CLI 用）
- 手順の詳細はスキル側に置き、このファイルには原則と制約だけを書く。**両方に同じ手順を書かない**（乖離の温床になる）

| スキル | 用途 |
|---|---|
| `issue-start` | Issue 作成〜着手準備（main 更新 → Spec 起案 → ブランチ作成） |
| `issue-cycle` | Red → Green → verify → spec:check → commit → PR → クローズ |
| `project-review` | この PJ 固有のレビュー観点（漏洩・Spec 整合・ストリーム規律・コスト暗黙劣化） |

## このリポジトリの制約（最優先）

**リモートは public リポジトリ（`Takashi-Fujie/coding_agent-viewer`）である。** 扱うデータは開発者個人の全作業ログなので、以下を絶対にコミット・投稿しない。

- 実ログのプロジェクトパス、プロンプト本文、PR URL
- `~/.claude/settings.json` の permissions 実値
- 実ログファイルそのもの（`tests/fixtures/` は**匿名化した合成 JSONL のみ**）
- `npm run report` の出力（`reports/` は `.gitignore` 済み）

Issue・PR・Spec・README に貼るのは**数値の要約まで**。

## 開発フロー

### TiDD

- **1 Issue = 1 ブランチ = 1 PR**
- ブランチ: `feat/<issue番号>-<slug>` / `fix/<issue番号>-<slug>`
- コミットは Conventional Commits、本文末尾に `Refs #<N>`。PR 本文に `Closes #<N>`
- Issue には SPEC-ID と受け入れ基準の要約のみ書く。詳細仕様は `docs/spec/` を参照させる

### GitHub 操作は `gh` CLI で行う

**GitHub 側の操作はすべて `gh` を使う。** Issue・PR・ラベル・リポジトリ設定・CI の確認まで含む。Web UI での手作業や生の API 呼び出しに頼らない（操作が再現可能で、ログに残るため）。

```bash
gh issue create --title "..." --body "..."        # Issue 作成
gh issue view <N> --comments                      # Issue 確認
gh issue close <N> --comment "..."                # 検証結果を添えてクローズ
gh pr create --title "..." --body "..."           # PR 作成（本文に Closes #N）
gh pr view <N> --comments
gh run list --limit 3                             # CI 実行一覧
gh run watch <run-id> --exit-status                # CI の完了待ちと成否判定
```

- 認証状態は `gh auth status` で確認する。トークンは `gh` が管理しているものを使い、環境変数やファイルに手で書かない
- Issue / PR の本文は**ヒアドキュメントで渡す**（日本語・バッククォート・チェックボックスが壊れないようにする）
- **`git` の push / fetch / commit は `git` で行う。** `gh` は GitHub 側の操作専用
- Issue のクローズは「動作確認が終わってから」。verify と spec:check の結果を要約してコメントに残す

#### remote 設定（この環境固有・実務メモ）

SSH の port 22 が外に出られない環境のため、remote は **SSH over 443** を指している。

```
origin  ssh://git@ssh.github.com:443/Takashi-Fujie/coding_agent-viewer.git
```

`git@github.com:...` 形式に戻すと push が接続タイムアウトする。HTTPS + `gh auth git-credential` も試したが 401 で通らなかった（`gho_` トークンでは Git 操作の認証が通らず、curl の Basic 認証では 200 が返る、という食い違いがある）。`gh` 自体は HTTPS で問題なく動くため、**GitHub API は `gh`、Git 転送は SSH over 443** という住み分けになっている。

ターミナルから直接操作する場合はこの制約を受けないので、各自の環境に合わせて構わない。

### SpecDD

`docs/spec/SPEC-*.md` が**仕様の正本**。運用規約は `docs/spec/README.md`。

サイクル: **Spec に受け入れ基準を追記（`- [ ]`）→ テストを書く（Red）→ 実装（Green）→ verify → spec:check → Spec を `- [x]` に更新 → commit**

Spec とコードは**同じ PR** に含める（diff で仕様変更をレビューできる状態を保つ）。

### TestDD

- テスト名は **`SPEC-ID: 説明` 形式**（ID の直後にコロン）。これが `spec:check` の突き合わせキーになる
  ```ts
  it('SPEC-COST-003: 1h キャッシュ書き込みを input 単価 x2.0 で計算する', () => { ... })
  ```
- テストデータとして ID 文字列を書くときは予約領域 **`SPEC-SAMPLE-***` を使う。突き合わせから常に除外される。
  実仕様の ID をテストデータに書くと孤児テストとして誤検出される（Issue #1 で実際に発生した）
- Vitest: サーバ側ロジック（パーサ / コスト計算 / 増分更新 / API）
- Playwright: 画面のレンダリングとライブ更新（Issue #10 で導入）
- フィクスチャには**巨大行（50KB+）・壊れた JSON 行・未知モデル行・`<synthetic>` 行**を必ず含める

### commit 前に必ず通す

```bash
npm run verify      # typecheck → lint → test:unit
npm run spec:check  # Spec ↔ ソースの乖離検査
```

**両方通るまで commit しない。** `spec:check` でずれが出たら「Spec を直す」か「実装を直す」かをユーザーに確認する（勝手にどちらかへ寄せない）。

`verify` は Issue の進行に合わせて段階的に構成を増やす（実体の無いコマンドを並べても検証にならないため）。現在の構成と追加予定は `docs/spec/SPEC-FLOW.md` の「段階導入の記録」を参照。

### セッションの区切りは Issue の区切り（`/compact` より優先）

**push と commit が終わり Issue を閉じたら、`/compact` ではなく新しいセッションへの切り替えを勧める。**

このプロジェクトは引き継ぎ情報を会話ではなくリポジトリと Issue に外部化してある。そのため compact で要約を持ち回る価値がほとんど無い（会話全体の再読と要約生成のコストを払い、プロンプトキャッシュも失って、ファイルを読めば分かることを劣化コピーで保持することになる）。

| 引き継ぎたいもの | 置き場所 |
|---|---|
| 開発フロー・commit 前ゲート・`gh` 運用・remote 設定 | この `CLAUDE.md`（毎セッション自動ロード） |
| 仕様の正本・受け入れ基準 | `docs/spec/SPEC-*.md` |
| 規約の背景（`SPEC-SAMPLE-` 予約領域など） | `docs/spec/SPEC-FLOW.md` |
| 工程・残タスク | GitHub Issue |
| 設計方針・調査で確定したデータ構造 | `README.md` / 各 Spec |

- **切り替える境界は PR マージ時**（Issue クローズ後）。前 Issue の試行錯誤を次の Issue に持ち込まない
- **Issue の途中（Red → Green の最中）でコンテキストが尽きた場合のみ `/compact`**。書きかけのテストや失敗内容はまだ外部に残っていないため、そこは要約で繋ぐしかない
- 新セッションでは会話の記憶ではなく Spec を実際に読み直す。これが SpecDD の正本性を保つ
- 切り替えを勧めるときは、次に着手する Issue 番号とブランチ名を含む「そのまま貼れる最初のメッセージ」を添える

## コマンド

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test:unit    # vitest run
npm run spec:check   # Spec ↔ ソース乖離検査
npm run verify       # 上記をまとめて（commit 前ゲート）
```

## 設計上の判断（変更時は要相談）

- **ログソースと viewer の間に中間層（正規化 DTO）を挟む。** viewer・API・集計は Claude 固有の JSONL 構造に直接依存させず、正規化済みの型（`server/core/types.ts` の `IndexRecord` / `SessionSummary` 等）だけを参照する。Claude 固有の解釈は `server/core/normalize.ts` 側に閉じ込める。将来の Codex CLI ログ対応時は、Codex 用の normalize を追加するだけで viewer 側を変更せずに済む構造を保つ（ソース固有フィールドを DTO に安易に生やさない）

- **JSONL は全読み込みしない。** 最大 69MB・1 行平均 50KB なので、byte offset 付きでストリーム走査し、インデックスには軽量メタのみ保持する。全文は表示時に offset で seek して該当行だけ読む
- **全文検索に転置インデックスを作らない。** 131MB 規模ならストリーム grep で十分速く、更新コストもかからない
- **増分更新は追記前提。** `fileSize > lastOffset` なら差分だけ解析。縮小・mtime 逆行を検知したら全再構築
- **壊れた JSON 行はスキップして継続する。** 1 行の破損で全体を落とさない
- **未知モデルのコストを 0 円扱いで黙らせない。** `unknownModel` フラグを立てて UI に警告を出す
- **コストは「推定」と明示する。** 単価は `server/pricing.json` に切り出し、ユーザーが編集できるようにする
- サーバは `127.0.0.1` のみに bind。認証は設けず、外部公開しない
- チャートを書く前に `dataviz` skill を読み込む

## 完了報告の規律

コードを直しただけで「直った」と報告しない。`npm run report` の数値、レンダリング結果、実測値のいずれかを確認してから完了とする。

ユーザーの指摘と実測が矛盾したら、黙って作り直さず実測値を提示して真の要件を確認する。
