/**
 * 本文ページの遅延取得とキャッシュ（SPEC-CHAT-026）。仕様は docs/design/CHAT.md。
 *
 * 本文はメタと違い重い（最大 50KB/行）ので、表示範囲のページだけを取得し、
 * 取得済みページは再取得しない。
 */
import type { MessageBody } from './types';

export interface BodyStoreOptions {
  pageSize: number;
  /** セッションの総レコード数。末尾ページの limit 計算に使う。 */
  total: number;
  fetchPage: (start: number, limit: number) => Promise<MessageBody[]>;
}

export interface BodyStore {
  /** index 番目の本文を返す。未取得なら該当ページごと取得する。 */
  ensure: (index: number) => Promise<MessageBody | undefined>;
  /** 取得済みなら同期で返す（仮想スクロールの描画用）。 */
  peek: (index: number) => MessageBody | undefined;
  /**
   * ライブ追記で総件数が増えたときに呼ぶ（SPEC-LIVE-024）。
   * 取得済みの完全ページは保持し、部分的だった末尾ページだけキャッシュから落とす。
   */
  grow: (newTotal: number) => void;
}

export function createBodyStore(options: BodyStoreOptions): BodyStore {
  const { pageSize, fetchPage } = options;
  let total = options.total;
  /** ページ番号 → 取得 Promise。in-flight の二重取得も防ぐ。 */
  const pages = new Map<number, Promise<MessageBody[]>>();
  const loaded = new Map<number, MessageBody[]>();

  function load(page: number): Promise<MessageBody[]> {
    let promise = pages.get(page);
    if (!promise) {
      const start = page * pageSize;
      const limit = Math.min(pageSize, total - start);
      promise = fetchPage(start, limit).then((items) => {
        loaded.set(page, items);
        return items;
      });
      pages.set(page, promise);
    }
    return promise;
  }

  return {
    async ensure(index) {
      const page = Math.floor(index / pageSize);
      const items = await load(page);
      return items[index - page * pageSize];
    },
    peek(index) {
      const page = Math.floor(index / pageSize);
      return loaded.get(page)?.[index - page * pageSize];
    },
    grow(newTotal) {
      if (newTotal <= total) return;
      if (total % pageSize !== 0) {
        const partialPage = Math.floor(total / pageSize);
        pages.delete(partialPage);
        loaded.delete(partialPage);
      }
      total = newTotal;
    },
  };
}
