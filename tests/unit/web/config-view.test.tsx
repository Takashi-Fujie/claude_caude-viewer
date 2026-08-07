// @vitest-environment jsdom
/**
 * 設定画面（SPEC-CONFIG-030〜033）。仕様は docs/design/CONFIG.md。
 * フィクスチャは合成のみ（実 permissions・実プロンプト本文を書かない）。
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../web/src/App';
import { parseRoute, routeHash } from '../../../web/src/router';
import { ConfigView } from '../../../web/src/views/ConfigView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  location.hash = '';
});

const CONFIG = {
  claudeDir: '/home/dev/.claude',
  agents: [
    {
      name: 'sample-reviewer',
      path: '/home/dev/.claude/agents/sample-reviewer.md',
      description: '合成レビュアー',
      tools: ['Read', 'Grep'],
      model: 'opus',
      parseError: false,
    },
    {
      name: 'idle-agent',
      path: '/home/dev/.claude/agents/idle-agent.md',
      description: null,
      tools: null,
      model: null,
      parseError: true,
    },
  ],
  skills: [
    {
      name: 'sample-skill',
      path: '/home/dev/.claude/skills/sample-skill/SKILL.md',
      description: '合成スキル',
      parseError: false,
    },
  ],
  plugins: [{ name: 'sample-plugin', marketplace: 'sample-marketplace' }],
  settings: {
    permissions: { allow: ['Bash(echo:*)'], deny: ['WebFetch'], ask: ['Write'] },
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo 合成hook' }] }],
    },
    enabledPlugins: { 'sample-plugin@sample-marketplace': true },
    statusLine: { type: 'command', command: 'echo 合成ステータス' },
  },
  history: [
    { project: '/home/dev/project-a', count: 3, lastTimestamp: '2026-01-02T12:00:00.000Z' },
    { project: '/home/dev/old-project', count: 1, lastTimestamp: '2026-01-01T00:00:00.000Z' },
  ],
};

const AGENT_STATS = {
  subagents: [{ name: 'sample-reviewer', count: 5, lastTimestamp: '2026-01-02T00:00:00.000Z' }],
  skills: [],
};

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(String(url), 'http://localhost').pathname;
      const body = path === '/api/config' ? CONFIG : path === '/api/stats/agents' ? AGENT_STATS : {};
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

describe('設定画面', () => {
  it('SPEC-CONFIG-030: #/config ルートで設定画面が表示され、ナビから遷移できる', async () => {
    expect(parseRoute('#/config')).toEqual({ view: 'config' });
    expect(routeHash({ view: 'config' })).toBe('#/config');

    stubApi();
    location.hash = '#/config';
    render(<App />);
    expect(await screen.findByRole('link', { name: '設定' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: '設定・定義' })).toBeTruthy();
  });

  it('SPEC-CONFIG-031: エージェント・スキル一覧に起動回数・最終起動日時・未使用バッジが表示される', async () => {
    stubApi();
    render(<ConfigView />);
    const table = await screen.findByTestId('config-agent-table');
    const reviewer = within(table).getByText('sample-reviewer').closest('tr')!;
    expect(within(reviewer).getByText('5')).toBeTruthy();
    expect(within(reviewer).queryByText('未使用')).toBeNull();

    const idle = within(table).getByText('idle-agent').closest('tr')!;
    expect(within(idle).getByText('未使用')).toBeTruthy();
    expect(within(idle).getByText('パース不能')).toBeTruthy();

    const skillTable = screen.getByTestId('config-skill-table');
    const skill = within(skillTable).getByText('sample-skill').closest('tr')!;
    expect(within(skill).getByText('未使用')).toBeTruthy();
  });

  it('SPEC-CONFIG-032: settings の hooks / permissions / enabledPlugins / statusLine が表示される', async () => {
    stubApi();
    render(<ConfigView />);
    const settings = await screen.findByTestId('config-settings');
    expect(within(settings).getByText('PreToolUse')).toBeTruthy();
    expect(within(settings).getByText('Bash(echo:*)')).toBeTruthy();
    expect(within(settings).getByText('WebFetch')).toBeTruthy();
    expect(within(settings).getByText('sample-plugin@sample-marketplace')).toBeTruthy();
    expect(within(settings).getByText(/合成ステータス/)).toBeTruthy();
  });

  it('SPEC-CONFIG-033: プロンプト履歴がプロジェクト別に件数・最終利用日時付きで表示される', async () => {
    stubApi();
    render(<ConfigView />);
    const table = await screen.findByTestId('config-history-table');
    const row = within(table).getByText('/home/dev/old-project').closest('tr')!;
    expect(within(row).getByText('1')).toBeTruthy();
    expect(within(table).getByText('/home/dev/project-a')).toBeTruthy();
  });
});
