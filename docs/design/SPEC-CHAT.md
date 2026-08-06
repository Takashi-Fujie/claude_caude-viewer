# SPEC-CHAT — セッション一覧とチャットビューア（詳細設計書）

担当 Issue: #6。人間向けの基本仕様書は [docs/spec/SPEC-CHAT.md](../spec/SPEC-CHAT.md)。

## 実装方針

- 長い会話は仮想スクロール（`@tanstack/react-virtual`）
- `system.compact_boundary` と `system.turn_duration` を会話の区切りとして表示
- 全文検索は転置インデックスを作らず、対象ファイルへのストリーム grep で行う（131MB 規模なら十分速く、更新コストもかからない）
- 本文の表示は正規化 DTO のインデックスから offset で seek して該当行だけ読む

## 受け入れ基準

Issue #6 着手時に記入する。
