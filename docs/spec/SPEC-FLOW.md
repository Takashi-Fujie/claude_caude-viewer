# SPEC-FLOW — 開発フロー基盤（基本仕様書）

`npm run spec:check` の仕様。Spec とソースの乖離を機械的に検出し、動作確認完了時のゲートとして使う。

## ゴール

「Spec に書いたのに実装・テストされていない」「Spec から消えたのにテストが残っている」を人手のレビューに頼らず検出する。

## できること

- Spec の受け入れ基準とテストコードを SPEC-ID で突き合わせ、**未テスト（untested）・孤児テスト（orphan）・ID 重複（duplicate）**を検出する
- `- [ ]` のまま残る基準を**警告（pending）**として一覧する（作業中は残るのが正常なため、エラーにはしない）
- `docs/design/SPEC-API.md` のエンドポイント表と実装ルートを突き合わせ、**片側にしか無い API（apiDrift）**を検出する
- 乖離が 1 件でもあれば失敗（exit 1）として commit をブロックする

## 人間の確認方法

```bash
npm run spec:check
```

出力の末尾が `✓ Spec とソースの乖離はありません` であること。乖離がある場合は種類別の一覧が表示されるので、「Spec を直す」か「実装を直す」かを判断する。

実装詳細・受け入れ基準は [docs/design/SPEC-FLOW.md](../design/SPEC-FLOW.md)。
