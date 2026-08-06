/**
 * ファイル監視とライブ差分配信のハブ。仕様は docs/design/LIVE.md。
 *
 * chokidar の変更検知 → SPEC-CORE の増分解析（buildIndex）→ 購読者ごとの既知件数
 * `have` からの差分送信、を一箇所で束ねる。SSE の書式化は routes/live.ts が担い、
 * ここは「何をいつ誰に送るか」だけを決める（テストが transport 抜きで検証できる形）。
 */
import { watch } from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { basename } from 'node:path';
import { buildIndex } from './core/indexer.js';
import { estimateRecordsCost } from './cost.js';
import type { PriceTable } from './cost.js';
import type { CostSummary } from './cost.js';
import { toMessageMetas } from './messages.js';
import type { MessageMetaDto } from './messages.js';
import type { SessionSummary } from './core/types.js';

export interface LiveAppendPayload {
  /** この番号のレコードから messages を追記する（クライアント既知件数と一致）。 */
  start: number;
  messages: MessageMetaDto[];
  /** 更新後の全量（差分ではない）。/api/sessions/:id の同名フィールドと同形。 */
  summary: SessionSummary;
  cost: CostSummary;
}

/** hub が sink へ渡すイベント。id は配信後の総レコード件数（SSE の id: になる）。 */
export type LiveSentEvent =
  | { event: 'append'; id: number; data: LiveAppendPayload }
  | { event: 'reset'; id: number };

export interface LiveSink {
  send(event: LiveSentEvent): void;
}

export interface LiveHubOptions {
  logDir: string;
  cacheDir: string;
  loadTable: () => Promise<PriceTable>;
  /** 同一ファイルの連続変更をまとめる待ち時間。既定 150ms。 */
  debounceMs?: number | undefined;
  /** テスト用の差し替え口。既定は SPEC-CORE の buildIndex。 */
  buildIndexFn?: typeof buildIndex | undefined;
}

export interface LiveHub {
  /**
   * セッションの差分購読を開始する。have はクライアントが既に持つレコード件数で、
   * それより新しいレコードがあれば購読直後に追い付き分を配信する。戻り値で解除する。
   */
  subscribe(sessionId: string, filePath: string, have: number, sink: LiveSink): () => void;
  /** ファイル変更の通知（watcher から。テストはこれと直接呼んで決定的に検証する）。 */
  notifyChange(filePath: string): void;
  /** watcher の初期走査完了を待つ（テストの追記が確実に検知されるように）。 */
  whenReady(): Promise<void>;
  subscriberCount(sessionId: string): number;
  close(): Promise<void>;
}

interface Subscriber {
  sessionId: string;
  filePath: string;
  have: number;
  sink: LiveSink;
}

/** ファイルパスからセッション id を得る（store.ts と同じ規約: 拡張子を除いたファイル名）。 */
function sessionIdOf(filePath: string): string {
  return basename(filePath, '.jsonl');
}

export function createLiveHub(options: LiveHubOptions): LiveHub {
  const debounceMs = options.debounceMs ?? 150;
  const build = options.buildIndexFn ?? buildIndex;
  const subscribers = new Set<Subscriber>();
  const timers = new Map<string, NodeJS.Timeout>();
  /** セッションごとの解析・配信の直列化（購読直後と watcher の同時 refresh で二重配信しない）。 */
  const queues = new Map<string, Promise<void>>();
  let watcher: FSWatcher | undefined;
  let ready = Promise.resolve();
  let closed = false;

  function ensureWatcher(): void {
    if (watcher || closed) return;
    watcher = watch(options.logDir, { ignoreInitial: true });
    ready = new Promise((resolve) => watcher?.once('ready', () => resolve()));
    const onFile = (path: string): void => {
      if (path.endsWith('.jsonl')) notifyChange(path);
    };
    watcher.on('add', onFile);
    watcher.on('change', onFile);
    // 監視エラーで hub を落とさない（SPEC-LIVE-003）。対象は次の変更で再試行される
    watcher.on('error', () => undefined);
  }

  async function refresh(sessionId: string): Promise<void> {
    const subs = [...subscribers].filter((s) => s.sessionId === sessionId);
    const filePath = subs[0]?.filePath;
    if (filePath === undefined) return;

    try {
      const [{ index }, table] = await Promise.all([
        build(filePath, { cacheDir: options.cacheDir }),
        options.loadTable(),
      ]);
      const records = index.records;
      const cost = estimateRecordsCost(records, table);
      for (const sub of subs) {
        if (!subscribers.has(sub)) continue; // 配信待ちの間に切断されていたら送らない
        if (records.length < sub.have) {
          // 縮小 → 全再構築が起きた。クライアントは詳細を取得し直す（SPEC-LIVE-014）
          sub.have = records.length;
          sub.sink.send({ event: 'reset', id: records.length });
        } else if (records.length > sub.have) {
          const start = sub.have;
          sub.have = records.length;
          sub.sink.send({
            event: 'append',
            id: records.length,
            data: { start, messages: toMessageMetas(records, table, start), summary: index.summary, cost },
          });
        }
      }
    } catch {
      // 読めない・解析できない状態は一時的とみなし、この回の配信だけを諦める（SPEC-LIVE-003）
    }
  }

  function enqueueRefresh(sessionId: string): void {
    const prev = queues.get(sessionId) ?? Promise.resolve();
    const next = prev.then(() => refresh(sessionId));
    queues.set(sessionId, next);
    void next.finally(() => {
      if (queues.get(sessionId) === next) queues.delete(sessionId);
    });
  }

  function notifyChange(filePath: string): void {
    if (closed) return;
    const sessionId = sessionIdOf(filePath);
    // 購読者がいないセッションは解析しない（SPEC-LIVE-005）
    if ([...subscribers].every((s) => s.sessionId !== sessionId)) return;
    const pending = timers.get(filePath);
    if (pending) clearTimeout(pending);
    timers.set(
      filePath,
      setTimeout(() => {
        timers.delete(filePath);
        enqueueRefresh(sessionId);
      }, debounceMs),
    );
  }

  return {
    subscribe(sessionId, filePath, have, sink) {
      ensureWatcher();
      const sub: Subscriber = { sessionId, filePath, have, sink };
      subscribers.add(sub);
      enqueueRefresh(sessionId); // 追い付き配信（SPEC-LIVE-012）
      return () => subscribers.delete(sub);
    },
    notifyChange,
    whenReady: () => ready,
    subscriberCount(sessionId) {
      return [...subscribers].filter((s) => s.sessionId === sessionId).length;
    },
    async close() {
      closed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      subscribers.clear();
      await watcher?.close();
      watcher = undefined;
    },
  };
}
