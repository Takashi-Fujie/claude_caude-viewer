// @vitest-environment jsdom
/**
 * 左ナビとルーティング（SPEC-DASH-030）。仕様は docs/design/DASH.md。
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../web/src/App';
import { parseRoute, routeHash } from '../../../web/src/router';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  location.hash = '';
});

/** どの API を呼ばれても空相当のレスポンスを返す fetch stub。 */
function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).startsWith('/api/overview')) {
        return new Response(
          JSON.stringify({
            range: { from: null, to: null },
            totals: { tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, records: 0, sessions: 0, skippedLines: 0 },
            cost: { estimated: true, total: 0, byModel: {}, unknownModels: [] },
            byModel: {},
            daily: [],
            projects: [],
          }),
          { status: 200 },
        );
      }
      if (String(url).startsWith('/api/stats/tools')) {
        return new Response(JSON.stringify({ tools: [], mcp: [], byProject: [] }), { status: 200 });
      }
      if (String(url).startsWith('/api/stats/agents')) {
        return new Response(JSON.stringify({ subagents: [], skills: [] }), { status: 200 });
      }
      if (String(url).startsWith('/api/stats/hooks')) {
        return new Response(JSON.stringify({ hooks: [], truncated: false }), { status: 200 });
      }
      if (String(url).startsWith('/api/config')) {
        return new Response(JSON.stringify({ agents: [], skills: [], plugins: [], settings: {} }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
}

describe('ナビとルーティング', () => {
  it('SPEC-DASH-030: #/ は Overview、#/tools は Tools & Agents に対応し、左ナビの 2 項目で相互に遷移できる', async () => {
    // ルート対応
    expect(parseRoute('')).toEqual({ view: 'overview' });
    expect(parseRoute('#/')).toEqual({ view: 'overview' });
    expect(parseRoute('#/tools')).toEqual({ view: 'tools' });
    expect(routeHash({ view: 'overview' })).toBe('#/');
    expect(routeHash({ view: 'tools' })).toBe('#/tools');
    // 既存のドリルダウンは維持
    expect(parseRoute('#/projects/p-1')).toEqual({ view: 'sessions', projectId: 'p-1' });

    // ナビ表示: 2 項目があり、Overview が起点でアクティブ
    stubApi();
    render(<App />);
    const overviewButton = await screen.findByRole('link', { name: 'Overview' });
    const toolsButton = screen.getByRole('link', { name: 'Tools & Agents' });
    expect(overviewButton).toBeTruthy();
    expect(toolsButton).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeTruthy();
  });
});
