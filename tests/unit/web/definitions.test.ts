/**
 * 定義と起動実績の突き合わせ（SPEC-CONFIG-020〜022）。仕様は docs/design/CONFIG.md。
 */
import { describe, expect, it } from 'vitest';
import { joinUsage } from '../../../web/src/lib/definitions';

const USAGE = [
  { name: 'sample-reviewer', count: 5, lastTimestamp: '2026-01-02T00:00:00.000Z' },
  { name: 'general-purpose', count: 9, lastTimestamp: '2026-01-03T00:00:00.000Z' },
  { name: 'sample-plugin:sample-skill', count: 2, lastTimestamp: '2026-01-01T00:00:00.000Z' },
];

describe('joinUsage', () => {
  it('SPEC-CONFIG-020: 定義と起動実績を名前の完全一致で結合し、総起動回数と最終起動日時を併記する', () => {
    const joined = joinUsage([{ name: 'sample-reviewer' }, { name: 'idle-agent' }], USAGE);
    const reviewer = joined.find((d) => d.name === 'sample-reviewer');
    expect(reviewer?.count).toBe(5);
    expect(reviewer?.lastTimestamp).toBe('2026-01-02T00:00:00.000Z');
  });

  it('SPEC-CONFIG-021: 起動実績が全期間 0 件の定義に unused フラグを立てる', () => {
    const joined = joinUsage([{ name: 'sample-reviewer' }, { name: 'idle-agent' }], USAGE);
    expect(joined.find((d) => d.name === 'idle-agent')).toEqual({
      name: 'idle-agent',
      count: 0,
      lastTimestamp: null,
      unused: true,
    });
    expect(joined.find((d) => d.name === 'sample-reviewer')?.unused).toBe(false);
  });

  it('SPEC-CONFIG-022: 起動実績にあって定義に無い名前（ビルトイン・プラグイン由来）は結合結果に含めず、異常扱いもしない', () => {
    // ユーザー定義スキル sample-skill とプラグイン由来 sample-plugin:sample-skill は別名
    const joined = joinUsage([{ name: 'sample-skill' }], USAGE);
    expect(joined).toEqual([
      { name: 'sample-skill', count: 0, lastTimestamp: null, unused: true },
    ]);
  });
});
