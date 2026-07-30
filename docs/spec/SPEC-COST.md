# SPEC-COST — 価格表とコスト計算

担当 Issue: #3

## ゴール

`assistant` レコードの `usage` から**推定**コストを算出する。キャッシュ書き込みは TTL（5分 / 1時間）で単価が異なるため、`usage.cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` を区別して計算する。

## 単価

$/1M tokens。キャッシュ単価は input 単価に対する倍率（read = 0.1x、write 5m = 1.25x、write 1h = 2.0x）で導出する。

| model | input | output |
|---|---|---|
| `claude-fable-5` | 10.00 | 50.00 |
| `claude-opus-5` | 5.00 | 25.00 |
| `claude-sonnet-5` | 3.00（2026-08-31 まで導入価格 2.00） | 15.00（同 10.00） |
| `claude-sonnet-4-6` | 3.00 | 15.00 |
| `claude-haiku-4-5` | 1.00 | 5.00 |

出典は `claude-api` skill（2026-06-24 時点のキャッシュ）。単価は変動するため `server/pricing.json` に切り出してユーザーが編集できるようにし、UI には「推定コスト」と明示する。

## 方針

- 価格表に無いモデル（`<synthetic>` を含む）は cost 0 とし、`unknownModel: true` を立てて UI に警告を出す。**サイレントに 0 円扱いしない。**
- 導入価格は `introUntil` フィールドで期間判定し、レコードの `timestamp` が期間内なら導入価格を適用する。

## 受け入れ基準

Issue #3 着手時に記入する。
