---
name: issue-cycle
description: Issue 確定後のブランチ作成 → Red → Green → verify → spec:check → commit → PR → クローズの 1 サイクルを定型化する。実装を始めるとき、テストを書くとき、commit・PR・Issue クローズをするときに使う。Issue の作成・Spec 起案は issue-start スキルが担当。
---

# Issue 実装サイクル

前提: `issue-start` 済み（Issue が存在し、対象 Spec に `- [ ]` の受け入れ基準がある）。

## ブランチ作成

main が最新であることを確認してからブランチを切る。

```bash
git switch main && git pull --ff-only
git switch -c feat/<issue番号>-<slug>
```

fix の場合は `fix/<issue番号>-<slug>`。前の Issue のブランチ上で作業を始めない。

ブランチを切ったら、`issue-start` で合意済みの受け入れ基準案を対象 Spec に `- [ ]` で追記する（Spec とコードは同じ PR に含める）。

## 実装ループ（受け入れ基準ごと）

1. **テストを書く（Red）** — テスト名は必ず `SPEC-ID: 説明` 形式（ID の直後にコロン）:
   ```ts
   it('SPEC-COST-003: 1h キャッシュ書き込みを input 単価 x2.0 で計算する', () => { ... })
   ```
   Red であることを実行して確認してから実装に入る。
2. **実装して Green にする** — 対象基準を満たす最小の実装。ついでの改善を混ぜない。
3. **Spec のチェックボックスを `- [x]` に更新する。**

### テストデータの規約

- ダミーの SPEC-ID 文字列は予約領域 **`SPEC-SAMPLE-*`** のみ使う。実仕様の ID をテストデータに書くと孤児テストとして誤検出される（Issue #1 で実際に発生）
- フィクスチャは匿名化した合成 JSONL のみ。**巨大行（50KB+）・壊れた JSON 行・未知モデル行・`<synthetic>` 行**を必ず含める
- 実ログのパス・プロンプト本文・permissions 実値をテストに書かない（public リポジトリ）

## commit 前ゲート

```bash
npm run verify && npm run spec:check
```

**両方通るまで commit しない。** `spec:check` でずれが出たら「Spec を直す」か「実装を直す」かをユーザーに確認する（勝手にどちらかへ寄せない）。

## commit → PR

- Conventional Commits、本文末尾に `Refs #<N>`
- Spec の変更とコードは**同じ PR** に含める
- 実測値（性能・件数・コスト集計）が得られたら数値の**要約だけ** Spec に記録する

```bash
git push -u origin HEAD
gh pr create --title "feat: <要約>（SPEC-<領域>）" --body "$(cat <<'EOF'
## 概要
...

## 検証
- npm run verify: pass
- npm run spec:check: 乖離なし

Closes #<N>
EOF
)"
gh run watch --exit-status
```

## クローズと切り替え

1. マージ後、verify / spec:check の結果要約をコメントに添えて `gh issue close <N> --comment "..."`
2. **`/compact` ではなく新セッションへの切り替えを勧める。** 次 Issue の番号とブランチ名を含む「そのまま貼れる最初のメッセージ」を添える（例: `Issue #5 に着手します。issue-start スキルで準備してください`）
