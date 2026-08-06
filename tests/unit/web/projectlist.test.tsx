// @vitest-environment jsdom
/**
 * 簡易プロジェクト一覧の表示規則（SPEC-CHAT-005）。仕様は docs/design/CHAT.md。
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectListView } from '../../../web/src/views/ProjectListView';
import type { ProjectListItem } from '../../../web/src/lib/types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PROJECTS: ProjectListItem[] = [
  {
    id: '-home-dev-project-a',
    path: '/home/dev/project-a',
    sessionCount: 3,
    totalTokens: 1000,
    estimatedCost: 0.5,
    lastTimestamp: '2026-01-02T00:00:00.000Z',
  },
  {
    id: '-home-dev-memory-only',
    path: null,
    sessionCount: 0,
    totalTokens: 0,
    estimatedCost: 0,
    lastTimestamp: null,
  },
];

function stubProjectsApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(PROJECTS), { status: 200 })),
  );
}

describe('ProjectListView', () => {
  it('SPEC-CHAT-005: セッション数 0 のプロジェクトは既定で隠れ、チェックを入れると表示される', async () => {
    stubProjectsApi();
    render(<ProjectListView />);

    // 既定: セッションを持つプロジェクトだけが出る
    expect(await screen.findByText('/home/dev/project-a')).toBeTruthy();
    expect(screen.queryByText('-home-dev-memory-only')).toBeNull();

    // チェックを入れるとセッション 0 のプロジェクトも出る
    fireEvent.click(screen.getByRole('checkbox'));
    expect(await screen.findByText('-home-dev-memory-only')).toBeTruthy();

    // 外すと再び隠れる
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.queryByText('-home-dev-memory-only')).toBeNull();
  });
});
