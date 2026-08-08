// @vitest-environment jsdom
/**
 * 全文検索パネル（SPEC-DASH-060〜062）。仕様は docs/design/DASH.md。
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchPanel } from '../../../web/src/components/SearchPanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  location.hash = '';
});

const HITS = [
  {
    projectId: '-home-dev-project-a',
    sessionId: 's0000000-0000-4000-8000-0000000000a1',
    offset: 0,
    preview: '検索語を含む合成の抜粋テキスト',
  },
  {
    projectId: '-home-dev-project-b',
    sessionId: 's0000000-0000-4000-8000-0000000000b1',
    offset: 120,
    preview: '2 件目の抜粋',
  },
];

function stubSearch(body: { hits: unknown[]; truncated: boolean }) {
  const fetchMock = vi.fn(async (url: string) => {
    const u = new URL(String(url), 'http://localhost');
    expect(u.pathname).toBe('/api/search');
    return new Response(JSON.stringify({ q: u.searchParams.get('q'), limit: 100, ...body }), {
      status: 200,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 検索ボックスに語を入れて送信する。 */
function submit(q: string) {
  const box = screen.getByRole('searchbox', { name: '全文検索' });
  fireEvent.change(box, { target: { value: q } });
  fireEvent.submit(box.closest('form')!);
}

describe('SearchPanel', () => {
  it('SPEC-DASH-060: 検索ボックスで語を送ると /api/search のヒット一覧（プロジェクト・セッション・抜粋）を表示する', async () => {
    const fetchMock = stubSearch({ hits: HITS, truncated: false });
    render(<SearchPanel />);
    submit('検索語');

    const list = await screen.findByTestId('search-hits');
    const sent = new URL(String(fetchMock.mock.calls[0]![0]), 'http://localhost');
    expect(sent.searchParams.get('q')).toBe('検索語');
    expect(list.textContent).toContain('-home-dev-project-a');
    expect(list.textContent).toContain('s0000000-0000-4000-8000-0000000000a1');
    expect(list.textContent).toContain('検索語を含む合成の抜粋テキスト');
    expect(list.textContent).toContain('2 件目の抜粋');
  });

  it('SPEC-DASH-061: 検索ヒットのクリックでそのセッションのセッション分析画面へ遷移する', async () => {
    stubSearch({ hits: HITS, truncated: false });
    render(<SearchPanel />);
    submit('検索語');

    await screen.findByTestId('search-hits');
    fireEvent.click(screen.getByText('検索語を含む合成の抜粋テキスト'));
    expect(location.hash).toBe(
      '#/projects/-home-dev-project-a/sessions/s0000000-0000-4000-8000-0000000000a1',
    );
  });

  it('SPEC-DASH-062: ヒット 0 件のとき「該当なし」を表示し、truncated のとき打ち切りを明示する', async () => {
    stubSearch({ hits: [], truncated: false });
    render(<SearchPanel />);
    submit('存在しない語');
    expect((await screen.findByTestId('search-hits')).textContent).toContain('該当なし');

    cleanup();
    vi.unstubAllGlobals();

    stubSearch({ hits: HITS, truncated: true });
    render(<SearchPanel />);
    submit('多すぎる語');
    expect((await screen.findByTestId('search-hits')).textContent).toContain('打ち切り');
  });
});
