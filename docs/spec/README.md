# Spec 運用規約

`docs/spec/`（基本仕様書）と `docs/design/`（詳細設計書）が**仕様の正本**である。GitHub Issue には SPEC-ID と受け入れ基準の要約のみを書き、詳細はここを参照する。

## 基本仕様書と詳細設計書

読者ごとにディレクトリを分ける。ファイル名は両方 `SPEC-<領域>.md` で揃え、置き場所が読者を表す。

| ディレクトリ | 読者 | 内容 |
|---|---|---|
| `docs/spec/` | **人間** | ゴール・できること・表示上の約束・人間の確認方法。要件合意ゲートのレビュー対象 |
| `docs/design/` | **AI** | データモデル・実装方針・**受け入れ基準チェックボックス**・実測値 |

- **受け入れ基準チェックボックスは詳細設計書（`docs/design/`）にのみ書く。** 両方に書くと `spec:check` の duplicate 検出に掛かる
- 基本仕様書は要件の合意に使うため、実装の言葉ではなく挙動の言葉で書く
- API エンドポイント表（`METHOD /api/...`）は `docs/design/SPEC-API.md` に書く（`spec:check` の apiDrift 突き合わせ対象）
- 両ファイルは相互リンクする（基本 → 詳細、詳細 → 基本）

## 領域一覧

| 領域 | 内容 |
|---|---|
| `SPEC-FLOW` | 開発フロー基盤（spec:check 自体の仕様） |
| `SPEC-CORE` | JSONL パーサ・インデクサ・キャッシュ・増分更新 |
| `SPEC-COST` | 価格表とコスト計算 |
| `SPEC-API` | HTTP API |
| `SPEC-CHAT` | セッション一覧・チャットビューア |
| `SPEC-DASH` | ダッシュボード（Overview / Tools & MCP / Agents & Skills） |
| `SPEC-LIVE` | ファイル監視とライブ更新 |
| `SPEC-CONFIG` | agents / skills / plugins / settings の可視化 |

## 受け入れ基準の書き方

**1 行 1 基準・一意 ID・検証可能な断定文**で書く。`- [ ]` が未実装、`- [x]` が実装＋テスト済み。

```markdown
- [ ] `SPEC-COST-003` cache_creation.ephemeral_1h_input_tokens を input 単価 × 2.0 で課金計算する
```

ID 形式は `SPEC-<領域>-<3桁連番>`。**ID は再利用・振り直しをしない**（消した仕様の ID は欠番のまま残す）。

`scripts/spec-check.ts` が定義として認識するのは上記のチェックボックス行だけである。本文中で ID に言及しても定義とはみなされない。

## 開発サイクル

Issue の作成（GitHub 反映）は `issue-start` スキル、以降は `issue-cycle` スキルが手順を持つ。

1. **Issue 読み込み** — 対象 Issue と領域を確定する（issue-start）
2. **基本仕様書反映** — ブランチ上で `docs/spec/SPEC-<領域>.md` にゴール・できること・確認方法を書く
3. **人間確認（要件合意ゲート）** — 基本仕様書をユーザーがレビューし合意する。**合意前に詳細・実装へ進まない**
4. **詳細設計書反映** — `docs/design/SPEC-<領域>.md` にデータモデル・実装方針・受け入れ基準（`- [ ]`）を書く
5. **実装（TDD）** — テスト名 `SPEC-ID: 説明` 形式でユニットテストを書き（Red）、実装して Green にする
6. **乖離チェック** — `npm run verify` → `npm run spec:check`
7. **E2E テスト** — Playwright 導入済みの領域のみ（Issue #10 で導入。それまでは省略）
8. **人間動作確認** — レンダリング・`npm run report` の数値・curl 出力など**成果物**で確認を受ける
9. **commit → PR** — 基準を `- [x]` に更新し、Spec とコードを同じ PR に含める。CI green まで確認して報告する
10. **人間レビュー・マージ** — **PR のレビューとマージは人間が行う**（エージェントは `gh pr merge` を実行しない）

テスト名の形式とテストデータの規約:

```ts
it('SPEC-COST-003: 1h キャッシュ書き込みを input 単価 x2.0 で計算する', () => { ... })
```

コロンが無い出現は参照として認識されない。テストデータとして ID 文字列を書く必要がある場合は予約領域 **`SPEC-SAMPLE-*`** を使う（定義・参照の突き合わせから常に除外される）。理由は `docs/design/SPEC-FLOW.md` の「自己適用で判明した規約」を参照。

## 禁止事項

このリポジトリは **public** である。Spec・Issue・PR・テストフィクスチャに以下を書いてはならない。

- 実ログのプロジェクトパス、プロンプト本文、PR URL
- `~/.claude/settings.json` の permissions 実値
- 実ログファイルそのもの（`tests/fixtures/` は匿名化した合成データのみ）
