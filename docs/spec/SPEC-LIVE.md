# SPEC-LIVE — ファイル監視とライブ更新

担当 Issue: #8

## ゴール

進行中のセッションをリロードなしで追えるようにする。

## 方針

`chokidar` で `~/.claude/projects/**/*.jsonl` を監視 → 変更検知 → `lastOffset` からの増分解析 → WebSocket で差分を push → クライアントが該当セッションのみ更新する。

## 受け入れ基準

Issue #8 着手時に記入する。
