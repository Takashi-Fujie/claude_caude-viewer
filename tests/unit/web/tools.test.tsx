// @vitest-environment jsdom
/**
 * Tools & Agents 画面（SPEC-DASH-050〜052）。仕様は docs/design/DASH.md。
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolsView } from '../../../web/src/views/ToolsView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TOOLS = {
  tools: [
    { name: 'Bash', count: 1842, failures: 201 },
    { name: 'Read', count: 1204, failures: 12 },
    { name: 'mcp__github__create_pr', count: 31, failures: 6 },
  ],
  mcp: [{ server: 'github', count: 31, failures: 6, tools: ['create_pr', 'list_issues'] }],
  byProject: [
    {
      project: '-home-dev-project-a',
      total: 3610,
      failures: 224,
      byTool: { Bash: 1842, Read: 1204, mcp__github__create_pr: 31 },
    },
  ],
};

const AGENTS = {
  subagents: [{ name: 'sample-reviewer', count: 17, lastTimestamp: '2026-08-06T10:00:00.000Z' }],
  skills: [{ name: 'dev-cycle', count: 21, lastTimestamp: '2026-08-06T05:05:00.000Z' }],
};

const HOOKS = {
  hooks: [
    {
      timestamp: '2026-08-06T05:08:00.000Z',
      hookName: 'PreToolUse:Bash',
      hookEvent: 'PreToolUse',
      project: '-home-dev-project-a',
      sessionId: 's-1',
    },
  ],
  truncated: false,
};

const CONFIG = {
  agents: [
    { name: 'sample-reviewer', description: '' },
    { name: 'old-migrator', description: '' },
  ],
  skills: [{ name: 'dev-cycle', description: '' }],
  plugins: [],
  settings: {},
};

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(String(url), 'http://localhost').pathname;
      const body =
        path === '/api/stats/tools'
          ? TOOLS
          : path === '/api/stats/agents'
            ? AGENTS
            : path === '/api/stats/hooks'
              ? HOOKS
              : path === '/api/config'
                ? CONFIG
                : path === '/api/projects'
                  ? []
                  : {};
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

describe('ToolsView', () => {
  it('SPEC-DASH-050: ツール別ランキング・失敗率・プロジェクト別利用・MCP 内訳・hook 発火履歴を表示する', async () => {
    stubApi();
    render(<ToolsView />);

    // ランキング（呼出回数付き）
    const ranking = await screen.findByTestId('tool-ranking');
    expect(within(ranking).getByText('Bash')).toBeTruthy();

    // 失敗率: 201 / 1842 = 10.9%
    const failures = screen.getByTestId('failure-table');
    expect(within(failures).getByText('10.9%')).toBeTruthy();

    // プロジェクト別
    const byProject = screen.getByTestId('project-tools-table');
    expect(within(byProject).getByText(/project-a/)).toBeTruthy();

    // MCP 内訳
    const mcp = screen.getByTestId('mcp-table');
    expect(within(mcp).getByText('github')).toBeTruthy();
    expect(within(mcp).getByText(/create_pr/)).toBeTruthy();

    // hook 発火履歴
    const hooks = screen.getByTestId('hook-table');
    expect(within(hooks).getByText('PreToolUse:Bash')).toBeTruthy();
  });

  it('SPEC-DASH-051: エージェント定義と起動実績を突き合わせ、起動 0 の定義に未使用バッジを表示する', async () => {
    stubApi();
    render(<ToolsView />);

    const table = await screen.findByTestId('agent-table');
    const used = within(table).getByText('sample-reviewer').closest('tr')!;
    expect(used.textContent).toContain('17');
    expect(used.textContent).not.toContain('起動実績なし');

    const unused = within(table).getByText('old-migrator').closest('tr')!;
    expect(unused.textContent).toContain('起動実績なし');
  });

  it('SPEC-DASH-052: Skill 呼び出し履歴は呼出回数と最終使用日時を表示する', async () => {
    stubApi();
    render(<ToolsView />);

    const table = await screen.findByTestId('skill-table');
    const row = within(table).getByText('dev-cycle').closest('tr')!;
    expect(row.textContent).toContain('21');
    // 最終使用日時（ローカル表記のため日付部分のみ確認）
    expect(row.textContent).toMatch(/2026/);
  });
});
