/**
 * レコード列から表示行への平坦化（SPEC-CHAT-020/025/030）。仕様は docs/design/CHAT.md。
 *
 * 仮想スクロールはこの 1 次元の行配列に対して行う。tool_result は独立行にせず
 * 発行元 assistant の行に取り付け、sidechain は parentUuid で連結して分岐行にまとめる。
 */
import type { MessageMeta } from './types';

export interface MessageRow {
  type: 'message';
  /** 行の並び・やりとり絞り込みに使う代表レコード位置。 */
  startIndex: number;
  record: MessageMeta;
  /** tool_use_id → 対応する tool_result レコード（SPEC-CHAT-020）。 */
  toolResults: Record<string, MessageMeta>;
}

export interface DividerRow {
  type: 'compact' | 'turn';
  startIndex: number;
  record: MessageMeta;
}

export interface SidechainRow {
  type: 'sidechain';
  startIndex: number;
  records: MessageMeta[];
}

export type Row = MessageRow | DividerRow | SidechainRow;

/** メイン列に行として現れない補助メタ（タイトル・モード等）。 */
const HIDDEN_KINDS = new Set(['title', 'mode', 'last-prompt', 'attachment', 'pr-link', 'unknown']);

export function buildRows(records: MessageMeta[]): Row[] {
  const rows: Row[] = [];
  /** sidechain の uuid → 属する分岐行。parentUuid の連結でチェーンを辿る。 */
  const branchByUuid = new Map<string, SidechainRow>();
  /** tool_use_id → その tool_use を発行した assistant 行。 */
  const ownerByToolUseId = new Map<string, MessageRow>();

  for (const record of records) {
    if (record.isSidechain) {
      let branch = record.parentUuid ? branchByUuid.get(record.parentUuid) : undefined;
      if (!branch) {
        branch = { type: 'sidechain', startIndex: record.index, records: [] };
        rows.push(branch);
      }
      branch.records.push(record);
      if (record.uuid) branchByUuid.set(record.uuid, branch);
      continue;
    }

    if (HIDDEN_KINDS.has(record.kind)) continue;

    if (record.kind === 'system') {
      if (record.subtype === 'compact_boundary') {
        rows.push({ type: 'compact', startIndex: record.index, record });
      } else if (record.durationMs !== undefined) {
        rows.push({ type: 'turn', startIndex: record.index, record });
      }
      // それ以外の system はメイン列に出さない
      continue;
    }

    if (record.kind === 'user' && record.isToolResult) {
      const owner = record.toolResultFor ? ownerByToolUseId.get(record.toolResultFor) : undefined;
      if (owner && record.toolResultFor) {
        owner.toolResults[record.toolResultFor] = record;
        continue;
      }
      // 発行元が見つからない結果は落とさず独立行として残す
    }

    const row: MessageRow = { type: 'message', startIndex: record.index, record, toolResults: {} };
    rows.push(row);
    for (const toolUse of record.toolUses ?? []) {
      ownerByToolUseId.set(toolUse.id, row);
    }
  }

  return rows;
}

/** やりとり絞り込み（SPEC-CHAT-044）: 指定範囲のレコードで始まる行だけ残す。 */
export function filterRows(rows: Row[], range: { startIndex: number; endIndex: number }): Row[] {
  return rows.filter((row) => row.startIndex >= range.startIndex && row.startIndex < range.endIndex);
}
