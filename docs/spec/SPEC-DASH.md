# SPEC-DASH — ダッシュボード

担当 Issue: #7

## ゴール

トークン・コスト・ツール・MCP の利用状況を俯瞰する 3 画面を提供する。

## 画面

1. **Overview** — 期間フィルタ、総コスト、日次トークン推移（積み上げ: input / output / cache write / cache read）、モデル別・プロジェクト別内訳、キャッシュヒット率
2. **Tools & MCP** — ツール別ランキング、`mcp__<server>__<tool>` から分解した MCP サーバ別内訳、失敗率（`toolUseResult.stderr` / `is_error`）、hook 発火履歴
3. **Agents & Skills** — `~/.claude/agents/*.md` の定義一覧 × 実際の起動回数の突き合わせ（未使用エージェントの検出）、Skill 呼び出し履歴、subagent 実行トレース

## 実装時の注意

チャートを書く前に `dataviz` skill を読み込む。

## 受け入れ基準

Issue #7 着手時に記入する。
