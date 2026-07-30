# SPEC-CORE — JSONL パーサとインデクサ

担当 Issue: #2

## ゴール

`~/.claude/projects/**/*.jsonl`（最大 69MB・1 行平均 50KB）を全読み込みせずに解析し、セッション横断で集計可能な軽量インデックスを構築する。

## 設計上の制約

- **1 行 = 1 レコードを byte offset 付きで走査する。** インデックスに保持するのは軽量メタ（offset, length, type, uuid, parentUuid, timestamp, role, model, usage, tool_use 名, 本文プレビュー 200 字）のみ。全文はメモリに載せず、詳細表示時に offset で seek して該当行だけ読む。
- **キャッシュ**: `.cache/index-<hash(path)>.json` に `{fileSize, mtimeMs, lastOffset, records, sessionSummary}` を保存。
- **増分更新**: JSONL は追記のみなので `fileSize > lastOffset` なら差分だけ解析。ファイル縮小・mtime 逆行を検知したら全再構築。
- **壊れた JSON 行はスキップして継続する**（1 行の破損で全体を落とさない）。

## 受け入れ基準

Issue #2 着手時に記入する。

## 参考: 実測されたレコード型

| type | 主なフィールド |
|---|---|
| `assistant` | `message.model`, `message.usage`, `message.content[]`, `requestId`, `isSidechain`, `effort` |
| `user` | `message.content`（string または `tool_result` 配列）, `toolUseResult`, `promptSource`, `permissionMode` |
| `system` | `subtype`: `turn_duration` / `compact_boundary` / `local_command` / `away_summary` |
| `attachment` | `attachment.type`: `task_reminder` / `hook_success` / `skill_listing` / `diagnostics` 等 |
| `pr-link` | `prNumber`, `prUrl`, `prRepository` |
| `mode` / `permission-mode` | `mode` |
| `ai-title` / `custom-title` / `last-prompt` | `aiTitle` / `customTitle` |
| `file-history-snapshot` | （初期スコープ外・スキップ） |

サブエージェントは `<session>/subagents/agent-*.jsonl` に分離保存され、同名 `.meta.json` の `toolUseId` で親セッションの `tool_use` と結合できる。
