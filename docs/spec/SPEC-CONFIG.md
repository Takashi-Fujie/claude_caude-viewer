# SPEC-CONFIG — 設定・定義の可視化

担当 Issue: #9

## ゴール

`~/.claude/` 配下の設定・定義を読み取り、実際の利用状況と突き合わせる。

## 対象

| パス | 内容 |
|---|---|
| `~/.claude/agents/*.md` | エージェント定義（frontmatter をパース） |
| `~/.claude/skills/*/SKILL.md` | ユーザー定義スキル |
| `~/.claude/plugins/` | インストール済みプラグイン・マーケットプレイス |
| `~/.claude/settings.json` | hooks / permissions / enabledPlugins / statusLine |
| `~/.claude/history.jsonl` | プロンプト履歴（`projects/` に無いリポジトリも含む） |

## 方針

定義一覧と起動実績を突き合わせ、**未使用のエージェント・スキル**を検出する。

`settings.json` の permissions 実値は**画面に出すが Spec・Issue・PR には転記しない**（public リポジトリのため）。

## 受け入れ基準

Issue #9 着手時に記入する。
