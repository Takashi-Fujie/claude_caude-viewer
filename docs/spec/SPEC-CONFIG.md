# SPEC-CONFIG — 設定・定義の可視化（基本仕様書）

担当 Issue: #9

## ゴール

`~/.claude/` 配下の設定・定義（エージェント・スキル・プラグイン・settings・プロンプト履歴）を読み取り、実際の利用状況と突き合わせる。

## できること

- エージェント・スキル・プラグインの定義一覧を表示する
- 定義と起動実績を突き合わせ、**未使用のエージェント・スキル**を検出する
- settings（hooks / permissions / enabledPlugins / statusLine）を可視化する

## 表示上の約束

`settings.json` の permissions 実値は**画面に出すが Spec・Issue・PR には転記しない**（public リポジトリのため）。

## 人間の確認方法

画面のレンダリング結果で、自身の `~/.claude/` の内容と一致することを確認する。詳細は Issue #9 着手時に具体化する。

実装方針・受け入れ基準は [docs/design/SPEC-CONFIG.md](../design/SPEC-CONFIG.md)。
