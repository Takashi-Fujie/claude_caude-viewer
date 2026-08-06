/**
 * 本文ページの遅延取得とキャッシュ（SPEC-CHAT-026）。仕様は docs/design/CHAT.md。
 */
import { describe, expect, it, vi } from 'vitest';
import { createBodyStore } from '../../../web/src/lib/bodystore';
import type { MessageBody } from '../../../web/src/lib/types';

const body = (text: string): MessageBody => ({ blocks: [{ type: 'text', text }] });

describe('createBodyStore', () => {
  it('SPEC-CHAT-026: 本文をページ単位で遅延取得し、取得済みページを再取得しない', async () => {
    const fetchPage = vi.fn(async (start: number, limit: number) =>
      Array.from({ length: limit }, (_, i) => body(`msg-${start + i}`)),
    );
    const store = createBodyStore({ pageSize: 10, total: 25, fetchPage });

    expect(await store.ensure(3)).toEqual(body('msg-3'));
    expect(await store.ensure(7)).toEqual(body('msg-7'));
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0, 10);

    await store.ensure(15);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenLastCalledWith(10, 10);

    // 末尾ページは total を超えない limit で要求する
    await store.ensure(24);
    expect(fetchPage).toHaveBeenLastCalledWith(20, 5);
  });

  it('SPEC-LIVE-024: 総件数が増えたとき取得済みの完全ページは保持し、末尾の部分ページだけ再取得する', async () => {
    const fetchPage = vi.fn(async (start: number, limit: number) =>
      Array.from({ length: limit }, (_, i) => body(`msg-${start + i}`)),
    );
    const store = createBodyStore({ pageSize: 10, total: 25, fetchPage });

    await store.ensure(3); // 完全ページ (0,10)
    await store.ensure(24); // 部分ページ (20,5)
    expect(fetchPage).toHaveBeenCalledTimes(2);

    store.grow(37);

    // 部分だった末尾ページは新しい limit で取り直す
    expect(await store.ensure(28)).toEqual(body('msg-28'));
    expect(fetchPage).toHaveBeenLastCalledWith(20, 10);
    expect(fetchPage).toHaveBeenCalledTimes(3);

    // 完全ページはキャッシュのまま（再取得しない）
    expect(await store.ensure(3)).toEqual(body('msg-3'));
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});
