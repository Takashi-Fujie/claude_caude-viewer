# SPEC-LIVE — ファイル監視とライブ更新（詳細設計書）

担当 Issue: #8。人間向けの基本仕様書は [docs/spec/SPEC-LIVE.md](../spec/SPEC-LIVE.md)。

## 実装方針

`chokidar` で `~/.claude/projects/**/*.jsonl` を監視 → 変更検知 → `lastOffset` からの増分解析 → WebSocket で差分を push → クライアントが該当セッションのみ更新する。

## 受け入れ基準

Issue #8 着手時に記入する。
