/**
 * メッセージメタ DTO の組み立て。仕様は docs/design/API.md（SPEC-API-030）/ docs/design/LIVE.md。
 *
 * /api/sessions/:id と SSE の append で同形を返すためここに一本化する。
 * assistant にはメッセージ単位の推定コストを付ける（単価計算をクライアントへ複製しない）。
 */
import { estimateCost } from './cost.js';
import type { PriceTable } from './cost.js';
import type { IndexRecord } from './core/types.js';

export type MessageMetaDto = IndexRecord & {
  index: number;
  cost?: { total: number; unknownModel: boolean };
};

/** records の start 番目以降を、絶対 index とメッセージ単位コスト付きの DTO へ写す。 */
export function toMessageMetas(records: IndexRecord[], table: PriceTable, start = 0): MessageMetaDto[] {
  return records.slice(start).map((record, i) => {
    const index = start + i;
    if (record.kind !== 'assistant' || !record.usage) return { index, ...record };
    const cost = estimateCost(
      {
        model: record.model,
        timestamp: record.timestamp,
        speed: record.usage.speed,
        usage: record.usage,
      },
      table,
    );
    return { index, ...record, cost: { total: cost.total, unknownModel: cost.unknownModel } };
  });
}
