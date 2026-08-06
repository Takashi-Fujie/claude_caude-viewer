/**
 * モデル → 色の固定割り当て（SPEC-DASH-041）。仕様は docs/design/DASH.md。
 *
 * dataviz の規律: カテゴリ色は固定順で割り当て、循環させない。5 番目以降は
 * 生成色ではなくフォールバック 1 色に畳む。同一レスポンス内でドーナツと
 * 積み上げが同じ Map を共有することで色の対応を保つ。
 */

export const MODEL_COLOR_VARS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'] as const;

/** 5 番目以降のモデルに使う色（hue を増やさない）。 */
export const FALLBACK_COLOR = 'var(--baseline)';

/** トークン降順（同数は名前昇順）で --s1〜--s4 を割り当てる。入力順に依存しない。 */
export function assignModelColors(models: { name: string; tokens: number }[]): Map<string, string> {
  const sorted = [...models].sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name));
  const colors = new Map<string, string>();
  sorted.forEach((model, i) => {
    colors.set(model.name, MODEL_COLOR_VARS[i] ?? FALLBACK_COLOR);
  });
  return colors;
}
