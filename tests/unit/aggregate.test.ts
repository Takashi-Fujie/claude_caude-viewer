/**
 * 日次集計のローカル日付対応（SPEC-DASH-010）。仕様は docs/design/DASH.md。
 *
 * tzOffset は「UTC からの東向き分オフセット」（JST = 540）。
 */
import { describe, expect, it } from 'vitest';
import { dailyOverview, dateOf, filterByRange } from '../../server/aggregate.js';
import { loadPriceTable } from '../../server/cost.js';
import { normalizeRecord } from '../../server/core/normalize.js';
import { assistantLine } from '../helpers/fixtures.js';
import type { IndexRecord } from '../../server/core/types.js';

const at = { offset: 0, length: 1 };

function record(timestamp: string): IndexRecord {
  const normalized = normalizeRecord(assistantLine({ timestamp }), at);
  if (!normalized) throw new Error('assistant レコードの正規化に失敗しました');
  return normalized;
}

describe('ローカル日付集計', () => {
  // UTC 2026-01-01 20:00 = JST 2026-01-02 05:00
  const lateNight = record('2026-01-01T20:00:00.000Z');

  it('SPEC-DASH-010: tzOffset（分・東向き）を渡すと日次集計と from / to フィルタがローカル日付で丸められる', async () => {
    // dateOf: 既定（UTC）と JST で日付が変わる
    expect(dateOf(lateNight)).toBe('2026-01-01');
    expect(dateOf(lateNight, 540)).toBe('2026-01-02');
    // 西向きオフセットはそのまま同日
    expect(dateOf(lateNight, -300)).toBe('2026-01-01');

    // filterByRange: JST では 01-02 の範囲に入る
    expect(filterByRange([lateNight], '2026-01-02', '2026-01-02')).toEqual([]);
    expect(filterByRange([lateNight], '2026-01-02', '2026-01-02', 540)).toEqual([lateNight]);
    expect(filterByRange([lateNight], '2026-01-01', '2026-01-01', 540)).toEqual([]);

    // dailyOverview: JST では 01-02 のバケットに入る
    const table = await loadPriceTable();
    expect(dailyOverview([lateNight], table).map((d) => d.date)).toEqual(['2026-01-01']);
    expect(dailyOverview([lateNight], table, 540).map((d) => d.date)).toEqual(['2026-01-02']);
  });
});
