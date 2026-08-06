# SPEC-CORE — JSONL パーサとインデクサ（詳細設計書）

担当 Issue: #2。人間向けの基本仕様書は [docs/spec/CORE.md](../spec/CORE.md)。

## 設計上の制約

- **1 行 = 1 レコードを byte offset 付きで走査する。** インデックスに保持するのは軽量メタ（offset, length, type, kind, uuid, parentUuid, timestamp, model, usage, tool_use 名, 本文プレビュー 200 字）のみ。全文はメモリに載せず、詳細表示時に offset で seek して該当行だけ読む。
- **キャッシュ**: `.cache/index-<hash(path)>.json` に `{schemaVersion, filePath, fileSize, mtimeMs, lastOffset, records, summary}` を保存。
- **増分更新**: JSONL は追記のみなので `fileSize > lastOffset` なら差分だけ解析。ファイル縮小・mtime 逆行を検知したら全再構築。
- **壊れた JSON 行はスキップして継続する**（1 行の破損で全体を落とさない）。
- **末尾の未完了行は確定させない。** 改行で終わっていない行は書き込み途中とみなして `lastOffset` に含めない。確定させると次回の増分更新で同じ行が二重に現れる。

## 実測（Issue #2 時点）

| 指標 | 値 |
|---|---|
| 対象 | 15 ファイル / 131.9 MB |
| 初回構築（全 15 本） | 434 ms |
| 無変更時の再構築（全 reuse） | 84 ms |
| 最大ファイル 69.1 MB 単体 | 89 ms / RSS 増分 45.7 MB |
| インデックス件数 | 11,003 件（未知 type 0 / 破損行 0） |
| キャッシュ総サイズ | 5.8 MB（元データの 4.4%） |

破損行・未知 type は実ログには現れないため、耐性の検証は合成フィクスチャ（`tests/fixtures/session-sample.jsonl`）でのみ可能である。

## 受け入れ基準

### 走査とオフセット

- [x] `SPEC-CORE-001` JSONL を 1 行 = 1 レコードとして byte offset と byte 長を付けて走査する
- [x] `SPEC-CORE-002` 記録した offset / length で該当行のみを seek して読み出せる
- [x] `SPEC-CORE-003` 50KB を超える巨大行も打ち切らずに 1 レコードとして扱う
- [x] `SPEC-CORE-004` 壊れた JSON 行はスキップして走査を継続し、skippedLineCount に数える
- [x] `SPEC-CORE-005` 改行で終わっていない末尾行は未完了として扱い、走査結果にも lastOffset にも含めない
- [x] `SPEC-CORE-006` インデックスが保持する本文プレビューは 200 字までに切り詰める

### レコード正規化

- [x] `SPEC-CORE-010` assistant から model / requestId / isSidechain を取り出す
- [x] `SPEC-CORE-011` assistant の content から thinking / text / tool_use を判別し、tool_use は id と name を保持する
- [x] `SPEC-CORE-012` usage の cache_creation を 5m / 1h に分けて保持する
- [x] `SPEC-CORE-013` usage の server_tool_use から web_search / web_fetch 回数を取り出す
- [x] `SPEC-CORE-014` model が `<synthetic>` の行は synthetic フラグを立てて集計と区別する
- [x] `SPEC-CORE-015` user の content が string / 配列のいずれでもプレビューを生成する
- [x] `SPEC-CORE-016` user の tool_result は対応する tool_use_id を保持する
- [x] `SPEC-CORE-017` system は subtype と durationMs を保持する
- [x] `SPEC-CORE-018` attachment は attachment.type を保持する
- [x] `SPEC-CORE-019` pr-link は prNumber / prRepository / prUrl を保持する
- [x] `SPEC-CORE-020` mode / permission-mode は mode 値を保持する
- [x] `SPEC-CORE-021` ai-title / custom-title を title として保持し、種別（ai / custom）を区別する
- [x] `SPEC-CORE-022` file-history-snapshot / queue-operation は初期スコープ外としてスキップする
- [x] `SPEC-CORE-023` 未知の type も unknown 分類で保持し、レコードを捨てない
- [x] `SPEC-CORE-024` Agent tool_use の input.subagent_type をサブエージェント起動として抽出する
- [x] `SPEC-CORE-025` Skill tool_use の input.skill と assistant の attributionSkill を skill 利用として抽出する
- [x] `SPEC-CORE-026` usage の speed / service_tier を保持する（fast mode は単価が異なるため SPEC-COST が参照する）

### セッション要約

- [x] `SPEC-CORE-030` model 別に input / output / cacheRead / cacheCreation トークンを合計する
- [x] `SPEC-CORE-031` tool_use 名ごとの呼び出し回数を集計する
- [x] `SPEC-CORE-032` 最初と最後の timestamp、assistant / user のメッセージ件数を集計する
- [x] `SPEC-CORE-033` セッションのタイトルは customTitle を aiTitle より優先する

### キャッシュと増分更新

- [x] `SPEC-CORE-040` `.cache/index-<hash>.json` に schemaVersion / fileSize / mtimeMs / lastOffset / records / summary を保存する
- [x] `SPEC-CORE-041` fileSize と mtimeMs が一致するキャッシュは再解析せず再利用する
- [x] `SPEC-CORE-042` fileSize > lastOffset のときは差分バイトのみを解析して追記する
- [x] `SPEC-CORE-043` キャッシュに記録した fileSize より小さくなる縮小を検知したら全再構築する
- [x] `SPEC-CORE-044` mtimeMs がキャッシュより過去へ逆行したら全再構築する
- [x] `SPEC-CORE-045` schemaVersion が現行と異なるキャッシュは破棄して全再構築する
- [x] `SPEC-CORE-046` 増分更新後のインデックスは同一ファイルを全再構築した結果と一致する

## 参考: 実測されたレコード型

`~/.claude/projects` 配下 15 ファイル・11,378 行に対する実測（2026-07-30）。

| type | 主なフィールド |
|---|---|
| `assistant` | `message.model`, `message.usage`, `message.content[]`, `requestId`, `isSidechain`, `effort`, `attributionSkill` |
| `user` | `message.content`（string または `tool_result` / `text` / `image` の配列）, `toolUseResult`, `promptSource`, `permissionMode` |
| `system` | `subtype`: `turn_duration` / `compact_boundary` / `local_command` / `away_summary` / `api_error` / `stop_hook_summary` / `informational` |
| `attachment` | `attachment.type`: `task_reminder` / `hook_success` / `skill_listing` / `diagnostics` 等 25 種 |
| `pr-link` | `prNumber`, `prUrl`, `prRepository` |
| `mode` / `permission-mode` | `mode` / `permissionMode` |
| `ai-title` / `custom-title` | `aiTitle` / `customTitle` |
| `last-prompt` | `lastPrompt`, `leafUuid` |
| `file-history-snapshot` / `queue-operation` | （初期スコープ外・スキップ） |

- `message.usage` は `input_tokens` / `output_tokens` / `cache_read_input_tokens` / `cache_creation_input_tokens` に加え、`cache_creation.{ephemeral_5m,ephemeral_1h}_input_tokens` と `server_tool_use.{web_search,web_fetch}_requests` を持つ。
- assistant の content ブロックは `thinking` / `text` / `tool_use` / `server_tool_use` / `advisor_tool_result`。
- **1 行の最大サイズは実測 1.3MB**（Read / Bash の tool_result）。行単位のバッファリングはこの規模を前提にする。
- サブエージェントは `<session>/subagents/agent-*.jsonl` に分離保存され、同名 `.meta.json`（`agentType` / `description` / `toolUseId`）の `toolUseId` で親セッションの `tool_use` と結合できる。
