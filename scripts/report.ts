/**
 * 実測値照合レポート CLI。仕様は docs/design/CORE.md（SPEC-CORE-050〜060）。
 *
 * 実ログ（~/.claude/projects）を走査してインデクサ・コスト計算の結果を集計し、
 * 規模に依存しない指標（実効レート・内訳整合）で基準値と照合する。
 * 判定ロジックは scripts/report-lib.ts（純関数）に分離してある。
 *
 * レポート全文は reports/（gitignore 済み）へ書き出す。実ログのパスを含むため
 * リポジトリにコミットしない。CI では実ログが無いため実行しない（ローカル専用）。
 */
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { buildIndex, cachePathFor } from '../server/core/indexer.js';
import { estimateRecordsCost, loadPriceTable, normalizeModelId } from '../server/cost.js';
import type { CostSummary } from '../server/cost.js';
import type { ModelTotals, SessionSummary } from '../server/core/types.js';
import {
  BASELINE_RATES,
  RATE_TOLERANCE,
  aggregateKindCounts,
  aggregateModelTotals,
  aggregateToolUseCounts,
  effectiveRates,
  evaluateGate,
} from './report-lib.js';
import type { EffectiveRate, GateResult, KindDistribution } from './report-lib.js';

export interface ReportOptions {
  logDir?: string;
  cacheDir?: string;
  reportDir?: string;
  baseline?: Record<string, number>;
  tolerance?: number;
  priceTablePath?: string;
  /** 進捗と要約の出力先。省略時は console.log。テストから差し替える。 */
  print?: (line: string) => void;
}

export interface ReportData {
  generatedAt: string;
  logDir: string;
  fileCount: number;
  totalBytes: number;
  recordCount: number;
  skippedLineCount: number;
  kinds: KindDistribution;
  toolUseCounts: Record<string, number>;
  /** 正規化済みモデル ID をキーとするトークン合計。 */
  models: Record<string, ModelTotals>;
  rates: Record<string, EffectiveRate>;
  cost: CostSummary;
  gate: GateResult;
  /** 最大セッションの構築時間（SPEC-CORE-058）。 */
  timing: { file: string; bytes: number; initialMs: number; cachedMs: number };
}

export interface ReportRun {
  exitCode: number;
  skipped: boolean;
  reportPath?: string;
  report?: ReportData;
}

/** logDir 配下の *.jsonl を再帰列挙する（サブエージェントの JSONL も含む）。 */
async function listJsonlFiles(logDir: string): Promise<string[]> {
  const entries = await readdir(logDir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => join(entry.parentPath, entry.name));
}

export async function runReport(options: ReportOptions = {}): Promise<ReportRun> {
  const logDir = options.logDir ?? join(homedir(), '.claude', 'projects');
  const cacheDir = options.cacheDir ?? '.cache';
  const reportDir = options.reportDir ?? 'reports';
  const print = options.print ?? ((line: string) => console.log(line));

  const exists = await stat(logDir).then(
    (s) => s.isDirectory(),
    () => false,
  );
  if (!exists) {
    print(`実ログディレクトリが無いため照合をスキップします: ${logDir}`);
    return { exitCode: 0, skipped: true };
  }

  const files = await listJsonlFiles(logDir);
  if (files.length === 0) {
    print(`JSONL が見つからないため照合をスキップします: ${logDir}`);
    return { exitCode: 0, skipped: true };
  }

  await mkdir(cacheDir, { recursive: true });
  await mkdir(reportDir, { recursive: true });

  // 全ファイルを走査して集計する
  const summaries: SessionSummary[] = [];
  const kindInputs: Parameters<typeof aggregateKindCounts>[0] = [];
  const allRecords = [];
  let totalBytes = 0;
  let largest: { file: string; bytes: number } | undefined;

  for (const file of files) {
    const { index } = await buildIndex(file, { cacheDir });
    summaries.push(index.summary);
    kindInputs.push(...index.records.map((r) => ({ kind: r.kind, type: r.type })));
    allRecords.push(...index.records);
    totalBytes += index.fileSize;
    if (!largest || index.fileSize > largest.bytes) {
      largest = { file, bytes: index.fileSize };
    }
  }

  const kinds = aggregateKindCounts(kindInputs);
  const toolUseCounts = aggregateToolUseCounts(summaries);
  // コスト側のキー（正規化済み ID）と揃えるため、モデル別合計も正規化 ID で再集約する
  const rawModels = aggregateModelTotals(summaries);
  const models = aggregateModelTotals(
    Object.entries(rawModels).map(([model, t]) => ({ models: { [normalizeModelId(model)]: t } })),
  );

  const table = await loadPriceTable(options.priceTablePath);
  const cost = estimateRecordsCost(allRecords, table);
  const rates = effectiveRates(models, cost);
  const gate = evaluateGate({
    kinds,
    models,
    cost,
    baseline: options.baseline ?? BASELINE_RATES,
    tolerance: options.tolerance ?? RATE_TOLERANCE,
  });

  // 最大セッションの構築時間を計測する（初回 = キャッシュ破棄後、再利用 = 直後にもう一度）
  const target = largest!;
  await rm(cachePathFor(cacheDir, target.file), { force: true });
  const initialStart = performance.now();
  await buildIndex(target.file, { cacheDir });
  const initialMs = performance.now() - initialStart;
  const cachedStart = performance.now();
  await buildIndex(target.file, { cacheDir });
  const cachedMs = performance.now() - cachedStart;

  const report: ReportData = {
    generatedAt: new Date().toISOString(),
    logDir,
    fileCount: files.length,
    totalBytes,
    recordCount: allRecords.length,
    skippedLineCount: summaries.reduce((sum, s) => sum + s.skippedLineCount, 0),
    kinds,
    toolUseCounts,
    models,
    rates,
    cost,
    gate,
    timing: { file: target.file, bytes: target.bytes, initialMs, cachedMs },
  };

  const reportPath = join(
    reportDir,
    `report-${report.generatedAt.replace(/[-:]/g, '').replace(/\..+$/, '')}.json`,
  );
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  // 標準出力には要約のみ（レポート全文は実ログのパスを含むためファイル側に置く）
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  print(`対象: ${files.length} ファイル / ${mb(totalBytes)} MB / ${allRecords.length} レコード`);
  print(`破損行スキップ: ${report.skippedLineCount} 行`);
  print(`kind 分布: ${Object.entries(kinds.counts).map(([k, n]) => `${k}=${n}`).join(' ')}`);
  print(`推定コスト合計: $${cost.total.toFixed(2)}（${cost.source}）`);
  for (const [model, rate] of Object.entries(rates)) {
    print(`  ${model}: ${rate.tokens.toLocaleString()} tokens / $${rate.costPerMTok.toFixed(4)} per 1M`);
  }
  print(
    `最大セッション ${mb(target.bytes)} MB: 初回 ${initialMs.toFixed(0)}ms / キャッシュ再利用 ${cachedMs.toFixed(0)}ms`,
  );
  for (const warning of gate.warnings) print(`警告: ${warning}`);
  for (const failure of gate.failures) print(`失敗: ${failure}`);
  print(gate.ok ? `照合 OK（レポート: ${reportPath}）` : `照合 NG（レポート: ${reportPath}）`);

  return { exitCode: gate.ok ? 0 : 1, skipped: false, reportPath, report };
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exitCode = (await runReport()).exitCode;
}
