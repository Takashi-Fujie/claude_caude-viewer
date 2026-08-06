/**
 * ルート共通の HTTP ヘルパ。仕様は docs/design/API.md。
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { DATE_RE } from './aggregate.js';
import type { PriceTable } from './cost.js';
import type { Snapshot } from './store.js';

/** 各ルートへ注入する依存。テストは logDir / cacheDir / claudeDir を差し替える。 */
export interface ApiContext {
  load(): Promise<Snapshot>;
  loadTable(): Promise<PriceTable>;
  claudeDir: string;
}

/** ステータスコード付きのエラー。エラーミドルウェアが JSON へ変換する。 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** async ハンドラの拒否をエラーミドルウェアへ確実に流す。 */
export function wrap(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

/** クエリ値を string として取り出す（配列・オブジェクトは無いものとして扱う）。 */
export function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** 正の整数クエリ。無い・不正なら既定値。 */
export function queryInt(value: unknown, fallback: number): number {
  const raw = queryString(value);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export interface DateRange {
  from: string | undefined;
  to: string | undefined;
}

/** from / to（YYYY-MM-DD）を検証して取り出す。不正な形式は 400。 */
export function parseRange(query: Record<string, unknown>): DateRange {
  const range: DateRange = { from: undefined, to: undefined };
  for (const key of ['from', 'to'] as const) {
    const value = queryString(query[key]);
    if (value === undefined) continue;
    if (!DATE_RE.test(value)) {
      throw new HttpError(400, `${key} は YYYY-MM-DD 形式で指定してください: ${value}`);
    }
    range[key] = value;
  }
  return range;
}
