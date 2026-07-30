# Spec 運用規約

このディレクトリの `SPEC-*.md` が**仕様の正本**である。GitHub Issue には SPEC-ID と受け入れ基準の要約のみを書き、詳細はここを参照する。

## ファイル分割

| ファイル | 領域 |
|---|---|
| `SPEC-FLOW.md` | 開発フロー基盤（spec:check 自体の仕様） |
| `SPEC-CORE.md` | JSONL パーサ・インデクサ・キャッシュ・増分更新 |
| `SPEC-COST.md` | 価格表とコスト計算 |
| `SPEC-API.md` | HTTP API |
| `SPEC-CHAT.md` | セッション一覧・チャットビューア |
| `SPEC-DASH.md` | ダッシュボード（Overview / Tools & MCP / Agents & Skills） |
| `SPEC-LIVE.md` | ファイル監視とライブ更新 |
| `SPEC-CONFIG.md` | agents / skills / plugins / settings の可視化 |

## 受け入れ基準の書き方

**1 行 1 基準・一意 ID・検証可能な断定文**で書く。`- [ ]` が未実装、`- [x]` が実装＋テスト済み。

```markdown
- [ ] `SPEC-COST-003` cache_creation.ephemeral_1h_input_tokens を input 単価 × 2.0 で課金計算する
```

ID 形式は `SPEC-<領域>-<3桁連番>`。**ID は再利用・振り直しをしない**（消した仕様の ID は欠番のまま残す）。

`scripts/spec-check.ts` が定義として認識するのは上記のチェックボックス行だけである。本文中で ID に言及しても定義とはみなされない。

## 開発サイクル

1. Spec に受け入れ基準を追記（`- [ ]`）
2. テストを書く。**テスト名を `SPEC-ID: 説明` 形式にする**（ID の直後にコロン。これが突き合わせのキー）
   ```ts
   it('SPEC-COST-003: 1h キャッシュ書き込みを input 単価 x2.0 で計算する', () => { ... })
   ```
   コロンが無い出現は参照として認識されない。テストデータとして ID 文字列を書く必要がある場合は
   予約領域 **`SPEC-SAMPLE-***` を使う（定義・参照の突き合わせから常に除外される）。理由は
   `SPEC-FLOW.md` の「自己適用で判明した規約」を参照。
3. 実装して Green にする
4. `npm run verify` → `npm run spec:check`
5. Spec のチェックボックスを `- [x]` に更新
6. commit（Spec とコードは同じ PR に含める）

## 禁止事項

このリポジトリは **public** である。Spec・Issue・PR・テストフィクスチャに以下を書いてはならない。

- 実ログのプロジェクトパス、プロンプト本文、PR URL
- `~/.claude/settings.json` の permissions 実値
- 実ログファイルそのもの（`tests/fixtures/` は匿名化した合成データのみ）
