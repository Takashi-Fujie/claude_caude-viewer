# SPEC-FLOW — 開発フロー基盤（詳細設計書）

`scripts/spec-check.ts` の実装詳細と受け入れ基準。

> **SPEC-FLOW に基本仕様書は無い。** 開発フローは AGENTS.md が基本仕様書相当（人間が合意する正本）、`issue-create` / `dev-cycle` スキルが実装に当たるため。このファイルは spec-check というツールの受け入れ基準台帳としてのみ存在する。

## 用語

| 用語 | 意味 |
|---|---|
| 定義 | `docs/spec/` と `docs/design/` の `*.md` のチェックボックス行に現れる SPEC-ID（規約上、基本仕様書にはチェックボックスを書かないため実質 `docs/design/` のみ） |
| 参照 | `tests/` 配下のテストコード中に `SPEC-ID:`（直後にコロン）の形で現れる SPEC-ID |
| untested | 定義があり参照がない ID |
| orphan | 参照があり定義がない ID |
| duplicate | 2 箇所以上で定義された ID |
| pending | `- [ ]` のまま残っている受け入れ基準 |
| apiDrift | `docs/design/API.md` と `server/routes/` の間で片側にしか存在しないエンドポイント |

## 受け入れ基準

- [x] `SPEC-FLOW-001` docs/spec と docs/design の *.md（README.md を除く）のチェックボックス行から `SPEC-<領域>-<3桁>` 形式の ID を定義として抽出する
- [x] `SPEC-FLOW-002` 本文中の ID 言及（チェックボックス行以外）は定義として扱わない
- [x] `SPEC-FLOW-003` テストコード中の `SPEC-ID:` 形式から参照を抽出する
- [x] `SPEC-FLOW-004` 定義があり参照がない ID を untested として報告する
- [x] `SPEC-FLOW-005` 参照があり定義がない ID を orphan として報告する
- [x] `SPEC-FLOW-006` 2 箇所以上で定義された ID を duplicate として報告する
- [x] `SPEC-FLOW-007` `- [ ]` のまま残る受け入れ基準を pending として報告する
- [x] `SPEC-FLOW-008` untested / orphan / duplicate のいずれかが 1 件以上あれば ok=false を返す
- [x] `SPEC-FLOW-009` pending は ok の判定に影響させない（作業中は残るのが正常なため警告扱い）
- [x] `SPEC-FLOW-010` docs/design/API.md のエンドポイント記述と server/routes の登録ルートを突き合わせ、片側のみのものを apiDrift として報告する
- [x] `SPEC-FLOW-011` API 側の定義とルートがともに 0 件のときは apiDrift 検査をスキップする
- [x] `SPEC-FLOW-012` apiDrift が 1 件以上あれば ok=false を返す
- [x] `SPEC-FLOW-013` 定義済み ID のうち `- [x]` のものに参照がなければ untested として報告する（チェック済みでもテストが無ければ不整合とみなす）
- [x] `SPEC-FLOW-014` ID の直後にコロンが続かない出現は参照として扱わない（テストデータ中の ID 文字列を参照と誤認しないため）
- [x] `SPEC-FLOW-015` `SPEC-SAMPLE-` で始まる ID を既定の除外プレフィクスとし、定義・参照の両方から除外する

## 設計背景: コロン必須と予約領域（SPEC-FLOW-014 / 015 の理由）

> 規範（テスト名の書き方・`SPEC-SAMPLE-` の使い方）の正本は `AGENTS.md` と `dev-cycle` スキル。ここに書くのは**なぜツールがこの仕様なのか**の記録のみ。

`spec-check` 自身のテストは、テストデータとして SPEC-ID 文字列を必ず含む。素朴に「テストコード中に現れる ID」を参照とみなすと、そのテストデータが孤児テストとして誤検出される。実際に Issue #1 でこれが発生した。これが参照認識を `SPEC-ID:`（直後にコロン）形式へ限定し（SPEC-FLOW-014）、`SPEC-SAMPLE-` を既定の除外プレフィクスとした（SPEC-FLOW-015）理由である。

- `analyze()` の `excludePrefixes` を明示すればテスト内で除外範囲を変えられる（`[]` で無効化、`['SPEC-SAMPLE-9']` のように絞り込み）ので、除外そのものの挙動も予約領域内で検証できる
- 除外機能を検証するテストで「除外されない側」の対比 ID を書くときも予約領域内に収める必要がある。領域外の ID を書くと、実ファイル走査でそれが本物の孤児テストとして検出される

## 段階導入の記録

`npm run verify` は Issue の進行に合わせて段階的に構成を増やす。実体の無いコマンドを verify に並べても検証にならないため、以下の順で追加する。

| 追加時期 | verify の構成 |
|---|---|
| Issue #1（現在） | `typecheck` → `lint` → `test:unit` |
| Issue #4 | 上記 + `report`（実ログに対する実測値照合） |
| Issue #10 | 上記 + `test:e2e`（Playwright） |
