// @vitest-environment jsdom
/**
 * 積み上げ + コスト折れ線のコンボチャート（SPEC-DASH-033 / 034）。仕様は docs/design/DASH.md。
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComboChart } from '../../../web/src/components/ComboChart';

afterEach(cleanup);

const DAYS = ['2026-08-04', '2026-08-05', '2026-08-06'];
const SERIES = [
  { key: 'input', label: 'input', color: 'var(--s1)', values: [1000, 0, 3000] },
  { key: 'output', label: 'output', color: 'var(--s2)', values: [500, 0, 800] },
];
const COST = [0.5, 0, 1.2];

describe('ComboChart', () => {
  it('SPEC-DASH-033: 積み上げとコスト折れ線を x 軸共有の上下 2 パネルで表示する（二軸グラフにしない）', () => {
    const { container } = render(
      <ComboChart days={DAYS} series={SERIES} cost={COST} selected={null} onSelectDay={() => {}} />,
    );

    // 1 つの svg の中に上下 2 パネル（トークン / コスト）がある
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(screen.getByTestId('tokens-panel')).toBeTruthy();
    expect(screen.getByTestId('cost-panel')).toBeTruthy();

    // 積み上げ: 値が 0 の日は描かれない（1000/3000 の input と 500/800 の output で 4 本）
    const bars = container.querySelectorAll('[data-series]');
    expect(bars).toHaveLength(4);

    // コストは折れ線（path）で、トークンの棒とは別パネル
    expect(screen.getByTestId('cost-panel').querySelector('path')).toBeTruthy();
  });

  it('SPEC-DASH-034: 帯クリックで日付を通知し、再クリックで解除（null）を通知する', () => {
    const onSelectDay = vi.fn();
    render(
      <ComboChart
        days={DAYS}
        series={SERIES}
        cost={COST}
        selected={null}
        onSelectDay={onSelectDay}
      />,
    );
    fireEvent.click(screen.getByTestId('band-2026-08-05'));
    expect(onSelectDay).toHaveBeenLastCalledWith('2026-08-05');

    // selected を渡した状態で同じ帯をクリックすると解除
    cleanup();
    render(
      <ComboChart
        days={DAYS}
        series={SERIES}
        cost={COST}
        selected="2026-08-05"
        onSelectDay={onSelectDay}
      />,
    );
    fireEvent.click(screen.getByTestId('band-2026-08-05'));
    expect(onSelectDay).toHaveBeenLastCalledWith(null);
  });
});
