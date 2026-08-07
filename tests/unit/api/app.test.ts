/**
 * SPEC-API の受け入れテスト。仕様は docs/design/API.md。
 *
 * supertest でアプリを直接叩く（listen しない）。ログは合成フィクスチャのみを使い、
 * 期待値はハードコードせず core 層の同じ関数（buildIndex / estimateRecordsCost）で
 * 計算する。これで「API がコアの結果を正しく写像しているか」だけを検証する。
 */
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../server/app.js';
import { DEFAULT_PORT, HOST, resolvePort } from '../../../server/index.js';
import { buildIndex } from '../../../server/core/indexer.js';
import { readRecordAt } from '../../../server/core/scan.js';
import { normalizeBody } from '../../../server/core/normalize.js';
import { estimateRecordsCost, loadPriceTable } from '../../../server/cost.js';
import type { IndexRecord } from '../../../server/core/types.js';
import { SAMPLE_FIXTURE, assistantLine, writeJsonl } from '../../helpers/fixtures.js';

const SESSION_A1 = 's0000000-0000-4000-8000-000000000001';
const SESSION_A2 = 's0000000-0000-4000-8000-000000000002';
const SESSION_B1 = 's0000000-0000-4000-8000-000000000003';
const PROJECT_A = '-home-dev-project-a';
const PROJECT_B = '-home-dev-project-b';

let root: string;
let logDir: string;
let cacheDir: string;
let claudeDir: string;
let app: Express;

/** サンプル + 合成 2 セッションのログディレクトリと ~/.claude 相当を組み立てる。 */
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ccv-api-test-'));
  logDir = join(root, 'projects');
  cacheDir = join(root, 'cache');
  claudeDir = join(root, 'claude');

  await mkdir(join(logDir, PROJECT_A), { recursive: true });
  await mkdir(join(logDir, PROJECT_B), { recursive: true });

  // プロジェクト A: サンプル（2026-01-01・巨大行・壊れ行・未知モデル入り）+ 2 日目の小セッション
  await cp(SAMPLE_FIXTURE, join(logDir, PROJECT_A, `${SESSION_A1}.jsonl`));
  await writeJsonl(join(logDir, PROJECT_A, `${SESSION_A2}.jsonl`), [
    {
      type: 'user',
      uuid: 'u-a2-1',
      parentUuid: null,
      isSidechain: false,
      timestamp: '2026-01-02T12:00:00.000Z',
      sessionId: SESSION_A2,
      cwd: '/home/dev/project-a',
      message: { role: 'user', content: '二日目の依頼文。' },
    },
    assistantLine({
      uuid: 'a-a2-1',
      model: 'claude-opus-5',
      timestamp: '2026-01-02T12:00:05.000Z',
      content: [{ type: 'text', text: '二日目の応答テキスト。' }],
    }),
  ]);

  // プロジェクト B: 3 日目の小セッション
  await writeJsonl(join(logDir, PROJECT_B, `${SESSION_B1}.jsonl`), [
    {
      type: 'user',
      uuid: 'u-b1-1',
      parentUuid: null,
      isSidechain: false,
      timestamp: '2026-01-03T12:00:00.000Z',
      sessionId: SESSION_B1,
      cwd: '/home/dev/project-b',
      message: { role: 'user', content: 'プロジェクト B の依頼文。' },
    },
    assistantLine({
      uuid: 'a-b1-1',
      model: 'claude-sonnet-5',
      timestamp: '2026-01-03T12:00:05.000Z',
      content: [{ type: 'text', text: 'プロジェクト B の応答テキスト。' }],
    }),
  ]);

  // ~/.claude 相当（config 用）
  await mkdir(join(claudeDir, 'agents'), { recursive: true });
  await mkdir(join(claudeDir, 'skills', 'sample-skill'), { recursive: true });
  await writeFile(
    join(claudeDir, 'agents', 'sample-reviewer.md'),
    '---\nname: sample-reviewer\ndescription: 合成レビュアー\n---\n本文\n',
    'utf8',
  );
  await writeFile(
    join(claudeDir, 'skills', 'sample-skill', 'SKILL.md'),
    '---\nname: sample-skill\ndescription: 合成スキル\n---\n本文\n',
    'utf8',
  );
  await writeFile(
    join(claudeDir, 'settings.json'),
    JSON.stringify({ permissions: { allow: ['Bash(echo:*)'] } }),
    'utf8',
  );
  await mkdir(join(claudeDir, 'plugins'), { recursive: true });
  await writeFile(
    join(claudeDir, 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'sample-plugin@sample-marketplace': [{}] } }),
    'utf8',
  );
  await writeFile(
    join(claudeDir, 'history.jsonl'),
    JSON.stringify({ display: '合成の依頼文', project: '/home/dev/project-a', timestamp: 1767225600000 }) + '\n',
    'utf8',
  );

  app = createApp({ logDir, cacheDir, claudeDir });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** テストと同じ core 関数で期待値を計算する。 */
async function expectedAll(): Promise<{ records: IndexRecord[]; skipped: number }> {
  const files = [
    join(logDir, PROJECT_A, `${SESSION_A1}.jsonl`),
    join(logDir, PROJECT_A, `${SESSION_A2}.jsonl`),
    join(logDir, PROJECT_B, `${SESSION_B1}.jsonl`),
  ];
  const records: IndexRecord[] = [];
  let skipped = 0;
  for (const file of files) {
    const { index } = await buildIndex(file, { cacheDir });
    records.push(...index.records);
    skipped += index.summary.skippedLineCount;
  }
  return { records, skipped };
}

describe('サーバ基本', () => {
  it('SPEC-API-001: 127.0.0.1 のみに bind し、既定ポート 4517 を PORT で上書きできる', () => {
    expect(HOST).toBe('127.0.0.1');
    expect(DEFAULT_PORT).toBe(4517);
    expect(resolvePort({})).toBe(4517);
    expect(resolvePort({ PORT: '9000' })).toBe(9000);
    expect(resolvePort({ PORT: 'abc' })).toBe(4517);
  });

  it('SPEC-API-002: 存在しない API パスに 404 と { error } JSON を返す', async () => {
    const res = await request(app).get('/api/no-such-endpoint');
    expect(res.status).toBe(404);
    expect(typeof res.body.error).toBe('string');
  });

  it('SPEC-API-003: ハンドラ内の例外は 500 の JSON になりサーバは落ちない', async () => {
    const broken = createApp({
      logDir,
      cacheDir,
      claudeDir,
      priceTablePath: join(root, 'no-such-pricing.json'),
    });
    const res = await request(broken).get('/api/overview');
    expect(res.status).toBe(500);
    expect(typeof res.body.error).toBe('string');
    // 同じアプリが次のリクエストにも応答できる（プロセスが死んでいない）
    const again = await request(broken).get('/api/pricing');
    expect(again.status).toBe(500);
  });
});

describe('GET /api/overview', () => {
  it('SPEC-API-010: 総トークン・推定コスト・モデル別内訳が estimateRecordsCost と一致する', async () => {
    const { records } = await expectedAll();
    const table = await loadPriceTable();
    const cost = estimateRecordsCost(records, table);

    const res = await request(app).get('/api/overview');
    expect(res.status).toBe(200);
    expect(res.body.cost.estimated).toBe(true);
    expect(res.body.cost.total).toBeCloseTo(cost.total, 10);
    expect(Object.keys(res.body.byModel).sort()).toEqual(Object.keys(cost.byModel).sort());

    const expectedTokens = records.reduce(
      (sum, r) =>
        sum +
        (r.usage ? r.usage.input + r.usage.output + r.usage.cacheRead + r.usage.cacheCreation : 0),
      0,
    );
    const t = res.body.totals.tokens;
    expect(t.input + t.output + t.cacheRead + t.cacheCreation).toBe(expectedTokens);
  });

  it('SPEC-API-011: from / to で期間を閉区間フィルタでき、不正な日付は 400', async () => {
    const res = await request(app).get('/api/overview?from=2026-01-02&to=2026-01-02');
    expect(res.status).toBe(200);
    const dates = res.body.daily.map((d: { date: string }) => d.date);
    expect(dates).toEqual(['2026-01-02']);

    const bad = await request(app).get('/api/overview?from=2026-1-2');
    expect(bad.status).toBe(400);
    expect(typeof bad.body.error).toBe('string');
  });

  it('SPEC-API-012: 価格表に無いモデルを unknownModels に列挙する', async () => {
    const res = await request(app).get('/api/overview');
    expect(res.body.cost.unknownModels).toContain('claude-imaginary-9');
  });

  it('SPEC-API-013: 日次系列（日付 × トークン種別 + 日次推定コスト）を返す', async () => {
    const res = await request(app).get('/api/overview');
    const daily: { date: string; tokens: Record<string, number>; cost: number }[] = res.body.daily;
    expect(daily.map((d) => d.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    for (const day of daily) {
      expect(day.tokens).toMatchObject({
        input: expect.any(Number),
        output: expect.any(Number),
        cacheRead: expect.any(Number),
        cacheCreation: expect.any(Number),
      });
      expect(day.cost).toBeTypeOf('number');
    }
    // 日次コストの和は全体の推定コストと一致する
    const { records } = await expectedAll();
    const table = await loadPriceTable();
    const total = estimateRecordsCost(records, table).total;
    const sum = daily.reduce((s, d) => s + d.cost, 0);
    expect(sum).toBeCloseTo(total, 10);
  });
});

describe('GET /api/projects', () => {
  it('SPEC-API-020: プロジェクト一覧（id・セッション数・トークン・推定コスト・最終更新）を返す', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    const byId = new Map(res.body.map((p: { id: string }) => [p.id, p]));
    expect([...byId.keys()].sort()).toEqual([PROJECT_A, PROJECT_B]);

    const a = byId.get(PROJECT_A) as {
      sessionCount: number;
      totalTokens: number;
      estimatedCost: number;
      lastTimestamp: string;
    };
    expect(a.sessionCount).toBe(2);
    expect(a.totalTokens).toBeGreaterThan(0);
    expect(a.estimatedCost).toBeGreaterThan(0);
    expect(a.lastTimestamp >= '2026-01-02').toBe(true);
  });

  it('SPEC-API-021: プロジェクト詳細は日次モデル別系列とセッション一覧を返す', async () => {
    const res = await request(app).get(`/api/projects/${PROJECT_A}`);
    expect(res.status).toBe(200);

    const sessionIds = res.body.sessions.map((s: { id: string }) => s.id).sort();
    expect(sessionIds).toEqual([SESSION_A1, SESSION_A2]);
    // サンプルセッションの手動タイトルが要約に載る
    const s1 = res.body.sessions.find((s: { id: string }) => s.id === SESSION_A1);
    expect(s1.title).toBe('サンプルセッション（手動命名）');

    const day2 = res.body.daily.find((d: { date: string }) => d.date === '2026-01-02');
    expect(day2.byModel['claude-opus-5']).toBeGreaterThan(0);
  });

  it('SPEC-API-022: 存在しない project id には 404 と JSON エラーを返す', async () => {
    const res = await request(app).get('/api/projects/no-such-project');
    expect(res.status).toBe(404);
    expect(typeof res.body.error).toBe('string');
  });
});

describe('GET /api/sessions/:id', () => {
  it('SPEC-API-030: 要約（モデル別トークン・推定コスト・skip 行数）とメッセージメタ一覧を返す', async () => {
    const res = await request(app).get(`/api/sessions/${SESSION_A1}`);
    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(PROJECT_A);
    expect(res.body.summary.models['claude-opus-5']).toBeDefined();
    expect(res.body.cost.estimated).toBe(true);
    expect(res.body.cost.total).toBeGreaterThan(0);
    expect(res.body.messages.length).toBe(res.body.summary.recordCount);
    expect(res.body.messages[0]).toMatchObject({ index: 0, kind: expect.any(String) });
  });

  it('SPEC-API-031: messages は start / limit のページングで指定範囲だけを返す', async () => {
    const res = await request(app).get(`/api/sessions/${SESSION_A1}/messages?start=1&limit=2`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
    expect(res.body.items[0].index).toBe(1);
    expect(res.body.items[1].index).toBe(2);
    expect(res.body.total).toBeGreaterThan(3);
  });

  it('SPEC-API-032: 本文はインデックスの offset / length で該当行だけを seek して読む', async () => {
    const file = join(logDir, PROJECT_A, `${SESSION_A1}.jsonl`);
    const { index } = await buildIndex(file, { cacheDir });

    const res = await request(app).get(
      `/api/sessions/${SESSION_A1}/messages?start=0&limit=${index.records.length}`,
    );
    expect(res.status).toBe(200);
    // 各 item の本文が「offset / length で seek した行」から正規化した結果と一致する
    for (const item of res.body.items as { index: number; body: unknown }[]) {
      const meta = index.records[item.index]!;
      const raw = await readRecordAt(file, meta.offset, meta.length);
      expect(item.body).toEqual(normalizeBody(raw));
    }
  });

  it('SPEC-API-033: 壊れた行を含むセッションでも skippedLineCount 付きで応答する', async () => {
    const res = await request(app).get(`/api/sessions/${SESSION_A1}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.skippedLineCount).toBeGreaterThan(0);
  });

  it('SPEC-API-034: 存在しない session id には 404 と JSON エラーを返す', async () => {
    const res = await request(app).get('/api/sessions/no-such-session');
    expect(res.status).toBe(404);
    expect(typeof res.body.error).toBe('string');

    const messages = await request(app).get('/api/sessions/no-such-session/messages');
    expect(messages.status).toBe(404);
  });
});

describe('GET /api/search', () => {
  it('SPEC-API-040: 全セッション横断でヒット行の sessionId・offset・preview を返す', async () => {
    const res = await request(app).get('/api/search?q=プロジェクト B の応答');
    expect(res.status).toBe(200);
    expect(res.body.truncated).toBe(false);
    const hit = res.body.hits.find((h: { sessionId: string }) => h.sessionId === SESSION_B1);
    expect(hit).toMatchObject({
      projectId: PROJECT_B,
      sessionId: SESSION_B1,
      offset: expect.any(Number),
      preview: expect.stringContaining('プロジェクト B の応答'),
    });
  });

  it('SPEC-API-041: q が未指定または空のとき 400 を返す', async () => {
    expect((await request(app).get('/api/search')).status).toBe(400);
    expect((await request(app).get('/api/search?q=')).status).toBe(400);
  });

  it('SPEC-API-042: ヒットが limit を超えたら打ち切り truncated: true で明示する', async () => {
    const res = await request(app).get('/api/search?q=応答テキスト&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.hits.length).toBe(1);
    expect(res.body.truncated).toBe(true);
  });
});

describe('GET /api/stats/*', () => {
  it('SPEC-API-050: stats/tokens はモデル別 × 日別のトークン集計を返す', async () => {
    const res = await request(app).get('/api/stats/tokens');
    expect(res.status).toBe(200);
    const row = res.body.find(
      (r: { model: string; date: string }) => r.model === 'claude-opus-5' && r.date === '2026-01-02',
    );
    expect(row).toBeDefined();
    expect(row.input + row.output + row.cacheRead + row.cacheCreation).toBeGreaterThan(0);
  });

  it('SPEC-API-051: stats/tools はツール別呼び出し回数を降順で返す', async () => {
    // レスポンス形は Issue #7 で { tools, mcp, byProject } に拡張された（docs/design/DASH.md）
    const res = await request(app).get('/api/stats/tools');
    expect(res.status).toBe(200);
    const names = res.body.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('Read');
    const counts = res.body.tools.map((t: { count: number }) => t.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('SPEC-API-052: stats/agents は subagent 別・skill 別の起動回数を返す', async () => {
    const res = await request(app).get('/api/stats/agents');
    expect(res.status).toBe(200);
    expect(res.body.subagents).toContainEqual(
      expect.objectContaining({ name: 'sample-reviewer', count: 1 }),
    );
    expect(res.body.skills).toContainEqual(
      expect.objectContaining({ name: 'sample-skill', count: 1 }),
    );
  });
});

describe('GET /api/config, /api/pricing', () => {
  it('SPEC-API-060: config は agents / skills / plugins / settings / history を返し、対象が無ければ空一覧', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.agents.map((a: { name: string }) => a.name)).toContain('sample-reviewer');
    expect(res.body.skills.map((s: { name: string }) => s.name)).toContain('sample-skill');
    // plugins は installed_plugins.json 由来（plugins/ 直下のディレクトリ名の羅列ではない）
    expect(res.body.plugins).toEqual([{ name: 'sample-plugin', marketplace: 'sample-marketplace' }]);
    expect(res.body.settings.permissions.allow).toContain('Bash(echo:*)');
    expect(res.body.history).toEqual([
      { project: '/home/dev/project-a', count: 1, lastTimestamp: '2026-01-01T00:00:00.000Z' },
    ]);

    const emptyApp = createApp({ logDir, cacheDir, claudeDir: join(root, 'no-such-claude') });
    const empty = await request(emptyApp).get('/api/config');
    expect(empty.status).toBe(200);
    expect(empty.body.agents).toEqual([]);
    expect(empty.body.skills).toEqual([]);
    expect(empty.body.plugins).toEqual([]);
    expect(empty.body.history).toEqual([]);
    expect(empty.body.settings).toBeNull();
  });

  it('SPEC-API-061: pricing は価格表と推定であることを示す source を返す', async () => {
    const res = await request(app).get('/api/pricing');
    expect(res.status).toBe(200);
    expect(res.body.estimated).toBe(true);
    expect(typeof res.body.source).toBe('string');
    expect(res.body.models['claude-opus-5']).toBeDefined();
  });
});
