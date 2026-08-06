---
name: issue-start
description: Issue の作成までを定型化する。新しい Issue を起こすとき、backlog の Issue の内容を確定するとき、「次の Issue を始めたい」と言われたときに使う。main 更新 → Spec 確認 → 受け入れ基準の起案 → Issue 作成/確認 までを行い、ブランチ作成と実装には入らない。
---

# Issue 作成

1 Issue = 1 ブランチ = 1 PR。このスキルは **Issue の内容確定まで**を担当する。ブランチ作成を含む実装以降は `issue-cycle` スキルを使う。

## 手順

### 1. main を最新化する

```bash
git switch main && git pull --ff-only
```

前の Issue のブランチに居たまま着手しない。マージ済みブランチは `git branch -d` で消してよい。

### 2. 対象 Issue を確定する

- **backlog にある場合**（`gh issue list` で確認）: その Issue を使う。
- **新規の場合**: 対象領域の `docs/spec/SPEC-*.md` に受け入れ基準案を起案し、ユーザーの合意を得てから作成する:

```bash
gh issue create --title "SPEC-<領域>: <要約>" --body "$(cat <<'EOF'
## 対象 Spec
docs/spec/SPEC-<領域>.md

## 受け入れ基準（要約）
- SPEC-<領域>-0XX 〜 0YY

詳細は Spec を正とする。
EOF
)"
```

Issue 本文に書くのは **SPEC-ID と要約のみ**。詳細仕様・実測値・ログ内容は書かない（public リポジトリ）。

### 3. 対象 Spec を読む

会話の記憶ではなく `docs/spec/SPEC-*.md` の正本を実際に読み直す。受け入れ基準が「着手時に記入する」のままなら、この時点で `- [ ]` 形式の基準案を起案してユーザーの合意を得る。

- ID 形式は `SPEC-<領域>-<3桁連番>`。欠番は再利用しない
- 1 行 1 基準・検証可能な断定文で書く
- **Spec ファイルへの追記はここでは行わない。** 追記は `issue-cycle` のブランチ上で行う（Spec とコードは同じ PR に含める規約のため）

### 4. 完了報告

Issue 番号と受け入れ基準の件数を報告して、このスキルは完了。ブランチ作成・テスト作成（Red）以降は `issue-cycle` へ。
