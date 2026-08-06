/**
 * 期間プリセットのローカル日付計算（SPEC-DASH-031）。仕様は docs/design/DASH.md。
 *
 * 「今日」は呼び出し側がローカル日付文字列で渡す。ここは純粋な日付計算のみで、
 * タイムゾーンに依存しない（CI と開発機で同じ結果になる）。
 */
import { describe, expect, it } from 'vitest';
import { presetRange, PRESETS } from '../../../web/src/lib/dates';

describe('presetRange', () => {
  const today = '2026-08-06';

  it('SPEC-DASH-031: 期間プリセットは基準日からローカル日付の from / to を決定的に計算する', () => {
    expect(presetRange('today', today)).toEqual({ from: '2026-08-06', to: '2026-08-06' });
    // 「7日」は今日を含む直近 7 日間
    expect(presetRange('7d', today)).toEqual({ from: '2026-07-31', to: '2026-08-06' });
    expect(presetRange('30d', today)).toEqual({ from: '2026-07-08', to: '2026-08-06' });
    expect(presetRange('90d', today)).toEqual({ from: '2026-05-09', to: '2026-08-06' });
    // 月初来
    expect(presetRange('mtd', today)).toEqual({ from: '2026-08-01', to: '2026-08-06' });
    // 月初日でも月初来は自分自身
    expect(presetRange('mtd', '2026-08-01')).toEqual({ from: '2026-08-01', to: '2026-08-01' });
    // 月・年またぎの引き算
    expect(presetRange('7d', '2026-01-03')).toEqual({ from: '2025-12-28', to: '2026-01-03' });

    // 画面の並び順の正本（今日 / 7日 / 30日 / 90日 / 月初来）
    expect(PRESETS.map((p) => p.key)).toEqual(['today', '7d', '30d', '90d', 'mtd']);
  });
});
