# SPEC-CONFIG — 設定・定義の可視化（詳細設計書）

担当 Issue: #9。人間向けの基本仕様書は [docs/spec/CONFIG.md](../spec/CONFIG.md)。

## 対象

| パス | 内容 | 読み方 |
|---|---|---|
| `~/.claude/agents/*.md` | エージェント定義 | frontmatter をパース |
| `~/.claude/skills/<name>/SKILL.md` | ユーザー定義スキル | frontmatter をパース |
| `~/.claude/plugins/installed_plugins.json` | インストール済みプラグイン | `plugins` のキー `name@marketplace` を分解 |
| `~/.claude/settings.json` | hooks / permissions / enabledPlugins / statusLine | そのままレスポンスへ（表示はレスポンス側で選別） |
| `~/.claude/history.jsonl` | プロンプト履歴 | ストリーム走査し**集計値のみ**保持 |

## データモデル

読み取り・パースは `server/claude-config.ts` に置く（routes から分離して直接テストする）。
Claude 固有のファイル構造の解釈はこのモジュールに閉じ込め、レスポンス DTO には汎用的な形だけを出す。

```ts
interface AgentDefinition {
  name: string;            // frontmatter の name。無ければファイル名（拡張子抜き）
  path: string;
  description: string | null;
  tools: string[] | null;  // カンマ区切りを分解。無ければ null（= 全ツール）
  model: string | null;
  parseError: boolean;     // frontmatter 欠落・壊れのとき true。一覧からは落とさない
}

interface SkillDefinition {
  name: string;            // ディレクトリ名
  path: string;
  description: string | null;
  parseError: boolean;
}

interface PluginInfo {
  name: string;            // installed_plugins.json のキー name@marketplace の name 部
  marketplace: string;
}

interface HistoryProject {
  project: string;         // history.jsonl の project（cwd パス）
  count: number;
  lastTimestamp: string | null;  // epoch ms を ISO 8601 に変換
}
```

### frontmatter パーサ

YAML ライブラリは追加しない。対象ファイルで実際に使われているサブセットのみ対応する:

- 先頭行 `---` から次の `---` までを対象とする
- `key: value` の 1 行形式のみ。値は素の文字列、または二重引用符付き（`\n` エスケープを展開）
- `tools` はカンマ区切りで分解して配列にする
- 先頭が `---` でない・閉じ `---` が無い場合は parseError とする

### history.jsonl の走査

- 1 行ずつストリーム読みし、`project` / `timestamp` だけを集計に使う
- **`display` / `pastedContents`（プロンプト本文）は集計にもレスポンスにも保持しない**（漏洩ガード）
- 壊れた行はスキップして継続する（セッション JSONL と同じ規律）

## API（docs/design/API.md の SPEC-API-060 を改訂）

`GET /api/config` のレスポンスを拡張する。エンドポイントは増やさない。

```ts
{
  claudeDir: string,
  agents: AgentDefinition[],       // name 昇順
  skills: SkillDefinition[],       // name 昇順
  plugins: PluginInfo[],           // name 昇順。旧実装の「plugins/ 直下のディレクトリ名」は廃止
  settings: unknown | null,        // settings.json そのまま。無い・壊れは null
  history: HistoryProject[]        // lastTimestamp 降順
}
```

起動実績は既存の `GET /api/stats/agents`（SPEC-API-052。count / lastTimestamp 付き）を再利用し、
突き合わせは web 側で行う。サーバに結合済みレスポンスを増やさない。

## 突き合わせ（web/src/lib/definitions.ts）

- 定義一覧と起動実績を**名前の完全一致**で結合する
- 全期間で起動 0 件 → `unused: true`。最近使っていないかは lastTimestamp の表示で判断させる
- 起動実績にあって定義に無い名前は結合結果に含めない（ビルトイン・プロジェクト固有・プラグイン由来が正常に該当するため、異常扱いしない）
- プラグイン由来スキルの起動名は `plugin:skill` 形式なので、完全一致の結果としてユーザー定義スキル（プレフィックス無し）とは別物になる

## 画面（web/src/views/ConfigView.tsx）

- ルート `#/config`。ナビに「設定」グループを追加
- セクション: エージェント / スキル / プラグイン / settings / プロンプト履歴
- エージェント・スキルの行: 名前・説明（先頭を切り詰め）・モデル・起動回数・最終起動日時・未使用バッジ
- parseError の行は「パース不能」の印を付けて表示する
- settings: hooks はイベント別、permissions は allow / deny / ask のルール実値、enabledPlugins / statusLine
- プロンプト履歴: プロジェクト別に件数・最終利用日時。`projects/` に無いプロジェクトもそのまま出る

## テスト方針

- フィクスチャは合成のみ: 壊れた frontmatter・引用符付き複数行 description・壊れた JSON 行・
  巨大行（50KB+ の pastedContents 相当）を含める。実ログのパス・プロンプト本文・permissions 実値は書かない
- server: `tests/unit/api/config.test.ts`（claude-config のパース単体 + supertest で /api/config）
- web: `tests/unit/web/definitions.test.ts`（突き合わせ）・`tests/unit/web/config-view.test.tsx`（画面）

## 受け入れ基準

### 読み取り（server/claude-config.ts）

- [x] `SPEC-CONFIG-001` agents/*.md の frontmatter から name / description / tools / model を抽出する
- [x] `SPEC-CONFIG-002` frontmatter が無い・壊れている定義は parseError=true とファイル名由来の name で一覧に残す
- [x] `SPEC-CONFIG-003` skills/<name>/SKILL.md の frontmatter から description を抽出する
- [x] `SPEC-CONFIG-004` installed_plugins.json のキー name@marketplace を分解してプラグイン一覧を返す
- [x] `SPEC-CONFIG-005` installed_plugins.json が無い・壊れている場合は空一覧を返す
- [x] `SPEC-CONFIG-010` history.jsonl をストリーム走査し、プロジェクト別の件数と最終利用日時（ISO 8601）を集計する
- [x] `SPEC-CONFIG-011` history.jsonl の壊れた行・巨大行はスキップまたは処理して継続する
- [x] `SPEC-CONFIG-012` history.jsonl が無い場合は空一覧を返す
- [x] `SPEC-CONFIG-013` history のレスポンスにプロンプト本文（display / pastedContents）を含めない

### 突き合わせ（web/src/lib/definitions.ts）

- [x] `SPEC-CONFIG-020` 定義と起動実績を名前の完全一致で結合し、総起動回数と最終起動日時を併記する
- [x] `SPEC-CONFIG-021` 起動実績が全期間 0 件の定義に unused フラグを立てる
- [x] `SPEC-CONFIG-022` 起動実績にあって定義に無い名前（ビルトイン・プラグイン由来）は結合結果に含めず、異常扱いもしない

### 画面（web/src/views/ConfigView.tsx）

- [x] `SPEC-CONFIG-030` #/config ルートで設定画面が表示され、ナビから遷移できる
- [x] `SPEC-CONFIG-031` エージェント・スキル一覧に起動回数・最終起動日時・未使用バッジが表示される
- [x] `SPEC-CONFIG-032` settings の hooks / permissions / enabledPlugins / statusLine が表示される
- [x] `SPEC-CONFIG-033` プロンプト履歴がプロジェクト別に件数・最終利用日時付きで表示される

### E2E（Issue #10・tests/e2e）

- [x] `SPEC-CONFIG-040` 設定・定義画面にエージェント・スキル・プラグインの一覧が合成 claudeDir の内容で描画される
- [x] `SPEC-CONFIG-041` frontmatter が壊れた定義が「パース不能」として一覧に残り、画面全体は描画される
- [x] `SPEC-CONFIG-042` 起動実績 0 件の定義に未使用バッジが表示される
