/**
 * viewer が参照する DTO 型。仕様は docs/design/CHAT.md。
 *
 * サーバの正規化 DTO（server/core/types.ts）と同形を保つため型だけを輸入する。
 * Claude 固有の生 JSONL 構造はここに現れない（normalize 側に閉じ込める）。
 */
import type { IndexRecord, SessionSummary } from '../../../server/core/types';
import type { BodyBlock, MessageBody } from '../../../server/core/normalize';
import type { CostSummary } from '../../../server/cost';

export type { BodyBlock, IndexRecord, MessageBody, SessionSummary };

/** メッセージ単位の推定コスト（サーバ側 estimateCost の要約。SPEC-CHAT-040）。 */
export interface MessageCost {
  total: number;
  unknownModel: boolean;
}

/** GET /api/sessions/:id の messages 要素。 */
export type MessageMeta = IndexRecord & {
  index: number;
  cost?: MessageCost | undefined;
};

/** GET /api/sessions/:id のレスポンス。 */
export interface SessionDetail {
  id: string;
  projectId: string;
  summary: SessionSummary;
  cost: CostSummary;
  messages: MessageMeta[];
}

/** GET /api/projects の 1 要素（簡易入口用。#7 で本実装に置き換える）。 */
export interface ProjectListItem {
  id: string;
  /** セッションの cwd 由来の実パス（SPEC-CHAT-004）。cwd が取れないときは null。 */
  path: string | null;
  sessionCount: number;
  totalTokens: number;
  estimatedCost: number;
  lastTimestamp: string | null;
}

/** GET /api/projects/:id の sessions の 1 要素。 */
export interface SessionListItem {
  id: string;
  title: string | null;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  recordCount: number;
  skippedLineCount: number;
  totalTokens: number;
  estimatedCost: number;
  models: string[];
}

/** GET /api/sessions/:id/messages のレスポンス。 */
export interface MessagesPage {
  start: number;
  limit: number;
  total: number;
  items: Array<{ index: number; meta: IndexRecord; body: MessageBody }>;
}
