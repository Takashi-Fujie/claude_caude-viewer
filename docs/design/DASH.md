# SPEC-DASH — ダッシュボード（詳細設計書）

担当 Issue: #7。人間向けの基本仕様書は [docs/spec/DASH.md](../spec/DASH.md)。

## 実装方針

- 日次トークン推移は積み上げ（input / output / cache write / cache read）
- MCP 内訳は `mcp__<server>__<tool>` 形式のツール名から分解する
- 失敗率は `toolUseResult.stderr` / `is_error` から算出する
- Agents & Skills は `~/.claude/agents/*.md` の定義一覧 × 起動実績の突き合わせ
- **チャートを書く前に `dataviz` skill を読み込む**

## 受け入れ基準

Issue #7 着手時に記入する。
