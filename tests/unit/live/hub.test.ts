/**
 * SPEC-LIVE 監視と増分解析（server/live.ts）。仕様は docs/design/LIVE.md。
 *
 * SPEC-LIVE-001/002 は chokidar の実監視で検証する（temp ディレクトリへの実追記）。
 * それ以外はデバウンス・購読の決定的な検証のため notifyChange を直接呼ぶ。
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveHub } from '../../../server/live.js';
import type { LiveAppendPayload, LiveHub, LiveSentEvent } from '../../../server/live.js';
import { loadPriceTable } from '../../../server/cost.js';
import { buildIndex } from '../../../server/core/indexer.js';
import { appendJsonl, assistantLine, withTempDir, writeJsonl } from '../../helpers/fixtures.js';

/** sink が受け取ったイベントを配列に積むだけのテスト用シンク。 */
function collector(): { events: LiveSentEvent[]; sink: { send: (e: LiveSentEvent) => void } } {
  const events: LiveSentEvent[] = [];
  return { events, sink: { send: (e) => events.push(e) } };
}

/** append イベントであることを確かめて data を取り出す。 */
function appendOf(event: LiveSentEvent | undefined): LiveAppendPayload {
  if (!event || event.event !== 'append') throw new Error(`append イベントではありません: ${String(event?.event)}`);
  return event.data;
}

const hubs: LiveHub[] = [];

function track(hub: LiveHub): LiveHub {
  hubs.push(hub);
  return hub;
}

afterEach(async () => {
  await Promise.all(hubs.splice(0).map((h) => h.close()));
});

describe('createLiveHub', () => {
  it('SPEC-LIVE-001: JSONL への追記を検知し、増分解析で追記分のレコードだけを配信する', async () => {
    await withTempDir(async (dir) => {
      const logDir = join(dir, 'projects');
      const project = join(logDir, '-home-dev-live');
      await mkdir(project, { recursive: true });
      const filePath = join(project, 'live-sess-a.jsonl');
      await writeJsonl(filePath, [
        assistantLine({ uuid: 'a-1', timestamp: '2026-01-01T00:00:00.000Z' }),
        assistantLine({ uuid: 'a-2', timestamp: '2026-01-01T00:00:01.000Z' }),
      ]);

      const hub = track(
        createLiveHub({ logDir, cacheDir: join(dir, 'cache'), loadTable: () => loadPriceTable(), debounceMs: 25 }),
      );
      const { events, sink } = collector();
      hub.subscribe('live-sess-a', filePath, 2, sink);
      await hub.whenReady();

      await appendJsonl(filePath, [assistantLine({ uuid: 'a-3', timestamp: '2026-01-01T00:00:02.000Z' })]);

      await vi.waitFor(() => expect(events.length).toBe(1), { timeout: 5000 });
      expect(events[0]?.id).toBe(3);
      const data = appendOf(events[0]);
      expect(data.start).toBe(2);
      expect(data.messages.map((m) => m.uuid)).toEqual(['a-3']);
    });
  });

  it('SPEC-LIVE-002: 監視開始後に新しく作成された JSONL ファイルも自動で監視対象に入る', async () => {
    await withTempDir(async (dir) => {
      const logDir = join(dir, 'projects');
      const project = join(logDir, '-home-dev-live');
      await mkdir(project, { recursive: true });
      const filePath = join(project, 'live-sess-new.jsonl');

      const hub = track(
        createLiveHub({ logDir, cacheDir: join(dir, 'cache'), loadTable: () => loadPriceTable(), debounceMs: 25 }),
      );
      const { events, sink } = collector();
      // ファイルはまだ存在しない（購読後に作成される）
      hub.subscribe('live-sess-new', filePath, 0, sink);
      await hub.whenReady();

      await writeJsonl(filePath, [assistantLine({ uuid: 'a-new-1' })]);

      await vi.waitFor(() => expect(events.length).toBe(1), { timeout: 5000 });
      expect(appendOf(events[0]).start).toBe(0);
      expect(appendOf(events[0]).messages.map((m) => m.uuid)).toEqual(['a-new-1']);
    });
  });

  it('SPEC-LIVE-003: 監視対象の解析でエラーが起きても落ちず、以後の変更検知を継続する', async () => {
    await withTempDir(async (dir) => {
      const logDir = join(dir, 'projects');
      const project = join(logDir, '-home-dev-live');
      await mkdir(project, { recursive: true });
      // ディレクトリを JSONL として購読させ、解析エラーを強制する
      const badPath = join(project, 'broken-dir.jsonl');
      await mkdir(badPath, { recursive: true });
      const goodPath = join(project, 'live-sess-good.jsonl');
      await writeJsonl(goodPath, [assistantLine({ uuid: 'a-good-1' })]);

      const hub = track(
        createLiveHub({ logDir, cacheDir: join(dir, 'cache'), loadTable: () => loadPriceTable(), debounceMs: 0 }),
      );
      const bad = collector();
      const good = collector();
      hub.subscribe('broken-dir', badPath, 0, bad.sink);
      hub.subscribe('live-sess-good', goodPath, 1, good.sink);

      // 解析エラーが起きるセッションの変更通知（例外がテストへ漏れないこと）
      hub.notifyChange(badPath);
      await appendJsonl(goodPath, [assistantLine({ uuid: 'a-good-2' })]);
      hub.notifyChange(goodPath);

      await vi.waitFor(() => expect(good.events.length).toBe(1), { timeout: 5000 });
      expect(appendOf(good.events[0]).messages.map((m) => m.uuid)).toEqual(['a-good-2']);
      expect(bad.events.length).toBe(0);
    });
  });

  it('SPEC-LIVE-004: 同一ファイルへの短時間の連続追記は 1 回の解析・配信にまとめる', async () => {
    await withTempDir(async (dir) => {
      const logDir = join(dir, 'projects');
      const project = join(logDir, '-home-dev-live');
      await mkdir(project, { recursive: true });
      const filePath = join(project, 'live-sess-burst.jsonl');
      await writeJsonl(filePath, [assistantLine({ uuid: 'a-1' })]);

      const hub = track(
        createLiveHub({ logDir, cacheDir: join(dir, 'cache'), loadTable: () => loadPriceTable(), debounceMs: 200 }),
      );
      const { events, sink } = collector();
      hub.subscribe('live-sess-burst', filePath, 1, sink);

      // デバウンス窓内の連続追記 + 連続通知
      await appendJsonl(filePath, [assistantLine({ uuid: 'a-2' })]);
      hub.notifyChange(filePath);
      await appendJsonl(filePath, [assistantLine({ uuid: 'a-3' })]);
      hub.notifyChange(filePath);

      await vi.waitFor(() => expect(events.length).toBeGreaterThan(0), { timeout: 5000 });
      // まとめられて 1 回の append に 2 件入る
      expect(events.length).toBe(1);
      expect(appendOf(events[0]).messages.map((m) => m.uuid)).toEqual(['a-2', 'a-3']);
    });
  });

  it('SPEC-LIVE-005: 購読者がいないセッションのファイル変更では解析を行わない', async () => {
    await withTempDir(async (dir) => {
      const logDir = join(dir, 'projects');
      const project = join(logDir, '-home-dev-live');
      await mkdir(project, { recursive: true });
      const subscribedPath = join(project, 'live-sess-sub.jsonl');
      const idlePath = join(project, 'live-sess-idle.jsonl');
      await writeJsonl(subscribedPath, [assistantLine({ uuid: 'a-sub-1' })]);
      await writeJsonl(idlePath, [assistantLine({ uuid: 'a-idle-1' })]);

      const buildIndexFn = vi.fn(buildIndex);
      const hub = track(
        createLiveHub({
          logDir,
          cacheDir: join(dir, 'cache'),
          loadTable: () => loadPriceTable(),
          debounceMs: 0,
          buildIndexFn,
        }),
      );
      const { events, sink } = collector();
      hub.subscribe('live-sess-sub', subscribedPath, 1, sink);

      // 購読の無いセッションの変更 → 解析されない
      hub.notifyChange(idlePath);
      // 購読のあるセッションの変更 → こちらは配信される（待ち合わせの基準）
      await appendJsonl(subscribedPath, [assistantLine({ uuid: 'a-sub-2' })]);
      hub.notifyChange(subscribedPath);

      await vi.waitFor(() => expect(events.length).toBe(1), { timeout: 5000 });
      const parsedPaths = buildIndexFn.mock.calls.map((c) => c[0]);
      expect(parsedPaths).not.toContain(idlePath);
    });
  });
});
