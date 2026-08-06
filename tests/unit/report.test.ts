/**
 * 実測値照合レポートのテスト。仕様は docs/design/CORE.md（SPEC-CORE-050〜060）。
 *
 * 照合ロジック（report-lib）は合成データで検証し、実ログには依存しない。
 * runReport はフィクスチャを実ログディレクトリ構造に見立てた一時ディレクトリで検証する。
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  aggregateKindCounts,
  aggregateModelTotals,
  aggregateToolUseCounts,
  checkBreakdownSums,
  checkRates,
  collectWarnings,
  effectiveRates,
  evaluateGate,
} from '../../scripts/report-lib.js';
import { runReport } from '../../scripts/report.js';
import { SAMPLE_FIXTURE, withTempDir } from '../helpers/fixtures.js';
import type { ModelTotals } from '../../server/core/types.js';
import type { CostSummary, ModelCost } from '../../server/cost.js';

const totals = (over: Partial<ModelTotals> = {}): ModelTotals => ({
  messages: 0,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheCreation: 0,
  cacheCreation5m: 0,
  cacheCreation1h: 0,
  webSearch: 0,
  webFetch: 0,
  ...over,
});

const modelCost = (over: Partial<ModelCost> = {}): ModelCost => ({
  messages: 0,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite5m: 0,
  cacheWrite1h: 0,
  total: 0,
  unknownModel: false,
  unknownRate: false,
  introApplied: false,
  fastApplied: false,
  ...over,
});

const costSummary = (over: Partial<CostSummary> = {}): CostSummary => ({
  estimated: true,
  source: 'テスト用ダミー',
  currency: 'USD',
  total: 0,
  byModel: {},
  unknownModels: [],
  ...over,
});

describe('集計', () => {
  it('SPEC-CORE-050: レコード群から kind 別件数の分布を集計する', () => {
    const records = [
      { kind: 'assistant', type: 'assistant' },
      { kind: 'assistant', type: 'assistant' },
      { kind: 'user', type: 'user' },
      { kind: 'unknown', type: 'mystery-type' },
    ] as const;

    const dist = aggregateKindCounts([...records]);

    expect(dist.counts).toEqual({ assistant: 2, user: 1, unknown: 1 });
    expect(dist.unknownTypes).toEqual(['mystery-type']);
  });

  it('SPEC-CORE-051: ツール別呼び出し回数をセッション横断で合算する', () => {
    const merged = aggregateToolUseCounts([
      { toolUseCounts: { Bash: 2, Read: 1 } },
      { toolUseCounts: { Bash: 3, Edit: 4 } },
    ]);

    expect(merged).toEqual({ Bash: 5, Read: 1, Edit: 4 });
  });

  it('SPEC-CORE-052: モデル別トークン合計をセッション横断で合算する', () => {
    const merged = aggregateModelTotals([
      { models: { 'sample-a': totals({ messages: 1, input: 10, output: 20, cacheRead: 30, cacheCreation: 40 }) } },
      {
        models: {
          'sample-a': totals({ messages: 2, input: 1, output: 2, cacheRead: 3, cacheCreation: 4 }),
          'sample-b': totals({ messages: 1, input: 100 }),
        },
      },
    ]);

    expect(merged['sample-a']).toMatchObject({ messages: 3, input: 11, output: 22, cacheRead: 33, cacheCreation: 44 });
    expect(merged['sample-b']).toMatchObject({ messages: 1, input: 100 });
  });
});

describe('実効レート照合', () => {
  it('SPEC-CORE-053: 実効レートが基準値の ±10% を超えたら照合失敗とする', () => {
    const models = { 'sample-a': totals({ input: 1_000_000 }) };

    // 実効レート $12/1M tokens vs 基準 $10 → +20% で失敗
    const over = checkRates(effectiveRates(models, costSummary({ byModel: { 'sample-a': modelCost({ total: 12 }) } })), {
      'sample-a': 10,
    });
    expect(over.failures).toHaveLength(1);
    expect(over.failures[0]).toContain('sample-a');

    // 実効レート $10.5/1M tokens → +5% で許容内
    const within = checkRates(
      effectiveRates(models, costSummary({ byModel: { 'sample-a': modelCost({ total: 10.5 }) } })),
      { 'sample-a': 10 },
    );
    expect(within.failures).toHaveLength(0);
  });

  it('SPEC-CORE-054: 基準値に無いモデル・トークン 0 のモデルは照合対象外として一覧に残す', () => {
    const rates = effectiveRates(
      {
        'sample-new': totals({ input: 1_000_000 }),
        'sample-empty': totals(),
      },
      costSummary({
        byModel: {
          'sample-new': modelCost({ total: 42 }),
          'sample-empty': modelCost(),
        },
      }),
    );

    const result = checkRates(rates, {});

    expect(result.failures).toHaveLength(0);
    expect(result.unchecked).toEqual(expect.arrayContaining(['sample-new', 'sample-empty']));
  });
});

describe('内訳整合', () => {
  it('SPEC-CORE-055: コスト内訳の和が合計と一致しなければ照合失敗とする', () => {
    const consistent = costSummary({
      total: 6,
      byModel: {
        'sample-a': modelCost({ input: 1, output: 2, cacheRead: 0.5, cacheWrite5m: 1.5, cacheWrite1h: 1, total: 6 }),
      },
    });
    expect(checkBreakdownSums(consistent)).toHaveLength(0);

    // モデル内訳の和と total がずれている
    const brokenModel = costSummary({
      total: 10,
      byModel: { 'sample-a': modelCost({ input: 1, output: 2, total: 10 }) },
    });
    expect(checkBreakdownSums(brokenModel).length).toBeGreaterThan(0);

    // モデル別 total の和と全体 total がずれている
    const brokenOverall = costSummary({
      total: 99,
      byModel: { 'sample-a': modelCost({ input: 1, output: 2, total: 3 }) },
    });
    expect(checkBreakdownSums(brokenOverall).length).toBeGreaterThan(0);
  });
});

describe('警告と合否', () => {
  it('SPEC-CORE-056: 未知 type・未知モデルは照合失敗にせず警告として出力する', () => {
    const gate = evaluateGate({
      kinds: { counts: { assistant: 1, unknown: 2 }, unknownTypes: ['mystery-type'] },
      models: { 'sample-a': totals({ input: 1_000_000 }) },
      cost: costSummary({
        total: 10,
        byModel: { 'sample-a': modelCost({ input: 10, total: 10 }) },
        unknownModels: ['<synthetic>'],
      }),
      baseline: { 'sample-a': 10 },
    });

    expect(gate.ok).toBe(true);
    expect(gate.failures).toHaveLength(0);
    expect(gate.warnings.some((w) => w.includes('mystery-type'))).toBe(true);
    expect(gate.warnings.some((w) => w.includes('<synthetic>'))).toBe(true);

    const warnings = collectWarnings(
      { counts: { unknown: 1 }, unknownTypes: ['mystery-type'] },
      costSummary({ unknownModels: ['<synthetic>'] }),
    );
    expect(warnings).toHaveLength(2);
  });

  it('SPEC-CORE-057: 照合失敗が 1 件以上あれば ok=false、なければ ok=true とする', () => {
    const models = { 'sample-a': totals({ input: 1_000_000 }) };
    const cost = costSummary({ total: 20, byModel: { 'sample-a': modelCost({ input: 20, total: 20 }) } });

    const failed = evaluateGate({ kinds: { counts: {}, unknownTypes: [] }, models, cost, baseline: { 'sample-a': 10 } });
    expect(failed.ok).toBe(false);
    expect(failed.failures.length).toBeGreaterThan(0);

    const passed = evaluateGate({ kinds: { counts: {}, unknownTypes: [] }, models, cost, baseline: { 'sample-a': 20 } });
    expect(passed.ok).toBe(true);
  });
});

describe('runReport（一時ディレクトリの合成ログに対して）', () => {
  /** フィクスチャを実ログのディレクトリ構造（<logDir>/<project>/<session>.jsonl）に配置する。 */
  async function setupLogDir(base: string): Promise<{ logDir: string; cacheDir: string; reportDir: string }> {
    const logDir = join(base, 'projects');
    await mkdir(join(logDir, 'sample-project'), { recursive: true });
    await copyFile(SAMPLE_FIXTURE, join(logDir, 'sample-project', 'session-sample.jsonl'));
    return { logDir, cacheDir: join(base, 'cache'), reportDir: join(base, 'reports') };
  }

  it('SPEC-CORE-058: 最大セッションの初回構築とキャッシュ再利用の所要時間を計測して出力する', async () => {
    await withTempDir(async (dir) => {
      const options = await setupLogDir(dir);
      const run = await runReport({ ...options, baseline: {}, print: () => {} });

      expect(run.report?.timing.file).toContain('session-sample.jsonl');
      expect(run.report?.timing.initialMs).toBeGreaterThanOrEqual(0);
      expect(run.report?.timing.cachedMs).toBeGreaterThanOrEqual(0);
    });
  });

  it('SPEC-CORE-059: レポート全文を reports/ 配下に JSON で書き出し、標準出力には要約を出す', async () => {
    await withTempDir(async (dir) => {
      const options = await setupLogDir(dir);
      const printed: string[] = [];
      const run = await runReport({ ...options, baseline: {}, print: (line) => printed.push(line) });

      expect(run.reportPath).toContain(options.reportDir);
      const written = JSON.parse(await readFile(run.reportPath!, 'utf8')) as typeof run.report;
      expect(written?.kinds.counts).toMatchObject(run.report?.kinds.counts ?? {});
      expect(written?.cost.estimated).toBe(true);
      expect(printed.length).toBeGreaterThan(0);
    });
  });

  it('SPEC-CORE-057: 照合失敗があれば exitCode 1、なければ 0 を返す', async () => {
    await withTempDir(async (dir) => {
      const options = await setupLogDir(dir);

      const passed = await runReport({ ...options, baseline: {}, print: () => {} });
      expect(passed.exitCode).toBe(0);

      // フィクスチャの実効レートがこの極端な基準値に収まることはない
      const failed = await runReport({
        ...options,
        baseline: { 'claude-sonnet-5': 0.000001 },
        print: () => {},
      });
      expect(failed.exitCode).toBe(1);
    });
  });

  it('SPEC-CORE-060: 実ログディレクトリが無ければ照合せず 0 で終了する', async () => {
    await withTempDir(async (dir) => {
      const run = await runReport({
        logDir: join(dir, 'no-such-dir'),
        cacheDir: join(dir, 'cache'),
        reportDir: join(dir, 'reports'),
        print: () => {},
      });

      expect(run.exitCode).toBe(0);
      expect(run.skipped).toBe(true);
      expect(run.report).toBeUndefined();
    });
  });
});
