# SPEC-CONFIG — 設定・定義の可視化（詳細設計書）

担当 Issue: #9。人間向けの基本仕様書は [docs/spec/SPEC-CONFIG.md](../spec/SPEC-CONFIG.md)。

## 対象

| パス | 内容 |
|---|---|
| `~/.claude/agents/*.md` | エージェント定義（frontmatter をパース） |
| `~/.claude/skills/*/SKILL.md` | ユーザー定義スキル |
| `~/.claude/plugins/` | インストール済みプラグイン・マーケットプレイス |
| `~/.claude/settings.json` | hooks / permissions / enabledPlugins / statusLine |
| `~/.claude/history.jsonl` | プロンプト履歴（`projects/` に無いリポジトリも含む） |

## 実装方針

定義一覧と起動実績（SPEC-CORE のサブエージェント・スキル抽出）を突き合わせ、未使用のエージェント・スキルを検出する。

## 受け入れ基準

Issue #9 着手時に記入する。
