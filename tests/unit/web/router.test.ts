/**
 * ハッシュルーティング（SPEC-CHAT-001）。仕様は docs/design/CHAT.md。
 */
import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash } from '../../../web/src/router';

describe('parseRoute / routeHash', () => {
  it('SPEC-CHAT-001: プロジェクト一覧 → セッション一覧 → セッション分析のハッシュを相互変換できる', () => {
    expect(parseRoute('')).toEqual({ view: 'projects' });
    expect(parseRoute('#/')).toEqual({ view: 'projects' });
    expect(parseRoute('#/projects/p-1')).toEqual({ view: 'sessions', projectId: 'p-1' });
    expect(parseRoute('#/projects/p-1/sessions/s-1')).toEqual({
      view: 'session',
      projectId: 'p-1',
      sessionId: 's-1',
    });
    // 不明なハッシュは一覧に倒す（リンク切れで白画面にしない）
    expect(parseRoute('#/nope')).toEqual({ view: 'projects' });

    expect(routeHash({ view: 'projects' })).toBe('#/');
    expect(routeHash({ view: 'sessions', projectId: 'p-1' })).toBe('#/projects/p-1');
    expect(routeHash({ view: 'session', projectId: 'p-1', sessionId: 's-1' })).toBe(
      '#/projects/p-1/sessions/s-1',
    );

    // URL に使えない文字を含む id も往復できる
    const round = parseRoute(routeHash({ view: 'sessions', projectId: 'a/b c' }));
    expect(round).toEqual({ view: 'sessions', projectId: 'a/b c' });
  });
});
