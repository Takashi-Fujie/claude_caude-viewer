/**
 * モデル → 色の固定割り当て（SPEC-DASH-041）。仕様は docs/design/DASH.md。
 */
import { describe, expect, it } from 'vitest';
import { assignModelColors, FALLBACK_COLOR } from '../../../web/src/lib/colors';

describe('assignModelColors', () => {
  it('SPEC-DASH-041: トークン降順で --s1〜--s4 を固定割り当てし、入力順に依存しない', () => {
    const models = [
      { name: 'model-a', tokens: 10 },
      { name: 'model-b', tokens: 30 },
      { name: 'model-c', tokens: 20 },
      { name: 'model-d', tokens: 5 },
      { name: 'model-e', tokens: 1 },
    ];
    const colors = assignModelColors(models);
    expect(colors.get('model-b')).toBe('var(--s1)');
    expect(colors.get('model-c')).toBe('var(--s2)');
    expect(colors.get('model-a')).toBe('var(--s3)');
    expect(colors.get('model-d')).toBe('var(--s4)');
    // 5 番目以降は生成色ではなくフォールバック（hue を循環させない）
    expect(colors.get('model-e')).toBe(FALLBACK_COLOR);

    // 入力順を変えても同じ割り当て（ドーナツと積み上げで共有できる）
    const shuffled = assignModelColors([...models].reverse());
    expect([...shuffled.entries()]).toEqual([...colors.entries()]);

    // 同トークンは名前昇順で安定
    const tie = assignModelColors([
      { name: 'z-model', tokens: 10 },
      { name: 'a-model', tokens: 10 },
    ]);
    expect(tie.get('a-model')).toBe('var(--s1)');
    expect(tie.get('z-model')).toBe('var(--s2)');
  });
});
