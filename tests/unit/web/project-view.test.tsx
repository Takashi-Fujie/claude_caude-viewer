// @vitest-environment jsdom
/**
 * プロジェクト画面（SPEC-DASH-040）。仕様は docs/design/DASH.md。
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionListView } from '../../../web/src/views/SessionListView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  location.hash = '';
});

const PROJECT = {
  id: '-home-dev-project-a',
  path: '/home/dev/project-a',
  range: { from: null, to: null },
  daily: [
    { date: '2026-08-05', byModel: { 'claude-opus-5': 4000, 'claude-sonnet-5': 1000 }, cost: 0.9 },
    { date: '2026-08-06', byModel: { 'claude-opus-5': 2000 }, cost: 0.4 },
  ],
  sessions: [
    {
      id: 's-1',
      title: '認証まわりのリファクタリング',
      firstTimestamp: '2026-08-05T01:00:00.000Z',
      lastTimestamp: '2026-08-06T10:00:00.000Z',
      recordCount: 312,
      skippedLineCount: 0,
      totalTokens: 4_200_000,
      estimatedCost: 1.84,
      models: ['claude-opus-5'],
    },
  ],
};

describe('SessionListView（プロジェクト画面）', () => {
  it('SPEC-DASH-040: 日次モデル別チャートとセッション一覧を表示し、パンくずで Overview へ戻れる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(PROJECT), { status: 200 })),
    );
    render(<SessionListView projectId="-home-dev-project-a" />);

    // セッション一覧
    expect(await screen.findByText('認証まわりのリファクタリング')).toBeTruthy();

    // 日次モデル別チャート（モデル名の凡例付きコンボチャート）
    expect(screen.getByTestId('tokens-panel')).toBeTruthy();
    expect(screen.getByTestId('cost-panel')).toBeTruthy();
    const legend = screen.getByTestId('model-legend');
    expect(within(legend).getByText('claude-opus-5')).toBeTruthy();
    expect(within(legend).getByText('claude-sonnet-5')).toBeTruthy();

    // パンくずの戻り先は Overview（#/）
    const back = screen.getByRole('link', { name: /Overview/ });
    expect(back.getAttribute('href')).toBe('#/');
  });
});
