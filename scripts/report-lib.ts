/**
 * 実測値照合レポートの判定ロジック。仕様は docs/design/CORE.md（SPEC-CORE-050〜057）。
 *
 * このモジュールは実ログに依存しない純関数のみを置く（CI でも unit テストできる境界）。
 * 実ログの走査と入出力は scripts/report.ts が担う。
 *
 * 実ログは追記で増え続けるため、照合は規模に依存しない指標だけで行う:
 *   - モデル別の実効レート（推定コスト ÷ 総トークン）が基準値の ±10% 以内
 *   - コスト内訳の和が合計と一致
 * 未知 type・未知モデルは外部（Claude Code / Anthropic）のアップデートでも増えるため、
 * ゲートにせず警告に留める（ゲートにすると無関係な commit が verify で止まる）。
 */
import type { IndexRecord, ModelTotals, SessionSummary } from '../server/core/types.js';
import type { CostSummary } from '../server/cost.js';

/** 実効レートの許容幅（基準値に対する相対比）。 */
export const RATE_TOLERANCE = 0.1;

/** 浮動小数の合計比較で許す絶対誤差（USD）。 */
const SUM_EPSILON = 1e-6;

/**
 * 事前調査時点のモデル別実効レート（$/1M tokens）。
 * 数値の根拠と更新手順は docs/design/CORE.md の「基準値」を参照。
 * 単価改定や pricing.json 編集で正当に変わった場合は設計書の表と同時に更新する。
 */
export const BASELINE_RATES: Record<string, number> = {
  'claude-fable-5': 2.1576,
  'claude-opus-5': 1.0479,
  'claude-sonnet-4-6': 0.8336,
  'claude-sonnet-5': 0.3476,
};

export interface KindDistribution {
  counts: Record<string, number>;
  /** kind が unknown だったレコードの元 type（重複除去・昇順）。警告表示に使う。 */
  unknownTypes: string[];
}

export interface EffectiveRate {
  tokens: number;
  /** $/1M tokens。tokens が 0 のときは 0。 */
  costPerMTok: number;
}

export interface RateCheckResult {
  failures: string[];
  /** 基準値が無い・トークン 0 で照合できなかったモデル。 */
  unchecked: string[];
}

export interface GateResult {
  ok: boolean;
  failures: string[];
  warnings: string[];
}

/** kind 別件数の分布を集計する。 */
export function aggregateKindCounts(records: Pick<IndexRecord, 'kind' | 'type'>[]): KindDistribution {
  const counts: Record<string, number> = {};
  const unknownTypes = new Set<string>();

  for (const record of records) {
    counts[record.kind] = (counts[record.kind] ?? 0) + 1;
    if (record.kind === 'unknown') unknownTypes.add(record.type);
  }

  return { counts, unknownTypes: [...unknownTypes].sort() };
}

/** ツール別呼び出し回数をセッション横断で合算する。 */
export function aggregateToolUseCounts(
  summaries: Pick<SessionSummary, 'toolUseCounts'>[],
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const summary of summaries) {
    for (const [tool, count] of Object.entries(summary.toolUseCounts)) {
      merged[tool] = (merged[tool] ?? 0) + count;
    }
  }
  return merged;
}

/** モデル別トークン合計をセッション横断で合算する。 */
export function aggregateModelTotals(
  summaries: Pick<SessionSummary, 'models'>[],
): Record<string, ModelTotals> {
  const merged: Record<string, ModelTotals> = {};
  for (const summary of summaries) {
    for (const [model, t] of Object.entries(summary.models)) {
      const into = (merged[model] ??= {
        messages: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheCreation: 0,
        cacheCreation5m: 0,
        cacheCreation1h: 0,
        webSearch: 0,
        webFetch: 0,
      });
      into.messages += t.messages;
      into.input += t.input;
      into.output += t.output;
      into.cacheRead += t.cacheRead;
      into.cacheCreation += t.cacheCreation;
      into.cacheCreation5m += t.cacheCreation5m;
      into.cacheCreation1h += t.cacheCreation1h;
      into.webSearch += t.webSearch;
      into.webFetch += t.webFetch;
    }
  }
  return merged;
}

/** 課金対象トークンの総数（input + output + cache read + cache write）。 */
function totalTokens(t: ModelTotals): number {
  return t.input + t.output + t.cacheRead + t.cacheCreation;
}

/**
 * モデル別の実効レート（$/1M tokens）を求める。
 * コスト側のモデルキーは正規化済み ID なので、トークン集計側も同じキーで来る前提。
 */
export function effectiveRates(
  models: Record<string, ModelTotals>,
  cost: CostSummary,
): Record<string, EffectiveRate> {
  const rates: Record<string, EffectiveRate> = {};
  for (const [model, t] of Object.entries(models)) {
    const tokens = totalTokens(t);
    const total = cost.byModel[model]?.total ?? 0;
    rates[model] = { tokens, costPerMTok: tokens > 0 ? (total / tokens) * 1_000_000 : 0 };
  }
  return rates;
}

/** 実効レートを基準値と照合する。基準値が無い・トークン 0 のモデルは unchecked に回す。 */
export function checkRates(
  rates: Record<string, EffectiveRate>,
  baseline: Record<string, number> = BASELINE_RATES,
  tolerance: number = RATE_TOLERANCE,
): RateCheckResult {
  const failures: string[] = [];
  const unchecked: string[] = [];

  for (const [model, rate] of Object.entries(rates)) {
    const expected = baseline[model];
    if (expected === undefined || rate.tokens === 0) {
      unchecked.push(model);
      continue;
    }
    const deviation = Math.abs(rate.costPerMTok - expected) / expected;
    if (deviation > tolerance) {
      failures.push(
        `実効レート乖離: ${model} = $${rate.costPerMTok.toFixed(4)}/1M tokens ` +
          `(基準 $${expected.toFixed(4)} から ${(deviation * 100).toFixed(1)}%、許容 ${tolerance * 100}%)`,
      );
    }
  }

  return { failures, unchecked: unchecked.sort() };
}

/** コスト内訳（モデル内・全体）の和が合計と一致するか検査する。 */
export function checkBreakdownSums(cost: CostSummary): string[] {
  const failures: string[] = [];
  let byModelTotal = 0;

  for (const [model, c] of Object.entries(cost.byModel)) {
    const sum = c.input + c.output + c.cacheRead + c.cacheWrite5m + c.cacheWrite1h;
    if (Math.abs(sum - c.total) > SUM_EPSILON) {
      failures.push(`内訳不整合: ${model} の内訳和 ${sum} が total ${c.total} と一致しない`);
    }
    byModelTotal += c.total;
  }

  if (Math.abs(byModelTotal - cost.total) > SUM_EPSILON) {
    failures.push(`内訳不整合: モデル別 total の和 ${byModelTotal} が全体 total ${cost.total} と一致しない`);
  }

  return failures;
}

/** 未知 type・未知モデルの警告文を作る（ゲートには使わない）。 */
export function collectWarnings(kinds: KindDistribution, cost: CostSummary): string[] {
  const warnings: string[] = [];
  if (kinds.unknownTypes.length > 0) {
    warnings.push(`未知 type が ${kinds.unknownTypes.length} 種あります: ${kinds.unknownTypes.join(', ')}`);
  }
  if (cost.unknownModels.length > 0) {
    warnings.push(`価格表に無いモデルがあります（cost は過小）: ${cost.unknownModels.join(', ')}`);
  }
  return warnings;
}

/** 照合全体の合否をまとめる。failures が 1 件でもあれば ok=false。 */
export function evaluateGate(input: {
  kinds: KindDistribution;
  models: Record<string, ModelTotals>;
  cost: CostSummary;
  baseline?: Record<string, number>;
  tolerance?: number;
}): GateResult {
  const rateCheck = checkRates(
    effectiveRates(input.models, input.cost),
    input.baseline ?? BASELINE_RATES,
    input.tolerance ?? RATE_TOLERANCE,
  );
  const failures = [...rateCheck.failures, ...checkBreakdownSums(input.cost)];
  const warnings = collectWarnings(input.kinds, input.cost);

  return { ok: failures.length === 0, failures, warnings };
}
