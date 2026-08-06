/**
 * SPEC-CHAT のサーバ側受け入れテスト（040/060）。仕様は docs/design/CHAT.md。
 *
 * メッセージ単位コストは cost 層の同じ関数（estimateCost）で期待値を計算し、
 * API がそれを正しく写像しているかだけを検証する。
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../server/app.js';
import { estimateCost, loadPriceTable } from '../../../server/cost.js';
import { assistantLine, writeJsonl } from '../../helpers/fixtures.js';

const SESSION = 's0000000-0000-4000-8000-000000000011';
const PROJECT = '-home-dev-project-chat';

let root: string;
let app: Express;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ccv-chat-test-'));
  const logDir = join(root, 'projects');
  const webDistDir = join(root, 'web-dist');
  await mkdir(join(logDir, PROJECT), { recursive: true });
  await mkdir(webDistDir, { recursive: true });

  await writeJsonl(join(logDir, PROJECT, `${SESSION}.jsonl`), [
    {
      type: 'user',
      uuid: 'u-1',
      parentUuid: null,
      isSidechain: false,
      timestamp: '2026-01-01T00:00:00.000Z',
      sessionId: SESSION,
      cwd: '/home/dev/project-chat',
      message: { role: 'user', content: '依頼文。' },
    },
    assistantLine({ uuid: 'a-1', model: 'claude-opus-5', timestamp: '2026-01-01T00:00:05.000Z' }),
    assistantLine({ uuid: 'a-2', model: 'unknown-model-x', timestamp: '2026-01-01T00:00:09.000Z' }),
  ]);

  await writeFile(join(webDistDir, 'index.html'), '<!doctype html><title>viewer-test</title>', 'utf8');
  await writeFile(join(webDistDir, 'app.js'), 'console.log("asset");', 'utf8');

  app = createApp({
    logDir,
    cacheDir: join(root, 'cache'),
    claudeDir: join(root, 'claude'),
    webDistDir,
  });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('プロジェクトの実パス表示', () => {
  it('SPEC-CHAT-004: プロジェクト一覧・詳細はセッションの cwd 由来の実パスを返す', async () => {
    const list = await request(app).get('/api/projects');
    expect(list.status).toBe(200);
    const project = (list.body as Array<Record<string, unknown>>).find((p) => p['id'] === PROJECT);
    // ディレクトリ名（- 変換形式）ではなく cwd の実パス
    expect(project?.['path']).toBe('/home/dev/project-chat');

    const detail = await request(app).get(`/api/projects/${PROJECT}`);
    expect(detail.status).toBe(200);
    expect(detail.body.path).toBe('/home/dev/project-chat');
  });
});

describe('GET /api/sessions/:id のメッセージ単位コスト', () => {
  it('SPEC-CHAT-040: assistant メタに推定コスト（total・unknownModel）を含める', async () => {
    const res = await request(app).get(`/api/sessions/${SESSION}`);
    expect(res.status).toBe(200);

    const table = await loadPriceTable();
    const messages = res.body.messages as Array<Record<string, unknown>>;

    const user = messages.find((m) => m['uuid'] === 'u-1');
    expect(user?.['cost']).toBeUndefined();

    const known = messages.find((m) => m['uuid'] === 'a-1');
    const expected = estimateCost(
      {
        model: 'claude-opus-5',
        timestamp: '2026-01-01T00:00:05.000Z',
        usage: (known as { usage: never })['usage'],
      },
      table,
    );
    expect(known?.['cost']).toEqual({ total: expected.total, unknownModel: false });
    expect(expected.total).toBeGreaterThan(0);

    const unknown = messages.find((m) => m['uuid'] === 'a-2');
    expect(unknown?.['cost']).toEqual({ total: 0, unknownModel: true });
  });
});

describe('web/dist の静的配信', () => {
  it('SPEC-CHAT-060: webDistDir があるときルートで index.html とアセットを配信する', async () => {
    const index = await request(app).get('/');
    expect(index.status).toBe(200);
    expect(index.text).toContain('viewer-test');

    const asset = await request(app).get('/app.js');
    expect(asset.status).toBe(200);

    // API の 404 応答（JSON）は静的配信の追加後も維持される
    const missing = await request(app).get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBeDefined();
  });
});
