/**
 * JSONL の 1 レコードを軽量メタへ正規化する。仕様は docs/spec/SPEC-CORE.md。
 *
 * 入力は他プロセスが書いたログなので、形が想定と違っても例外を投げずに
 * 「取れたものだけ取る」方針で書く。未知の type も捨てずに unknown として残す。
 */
import type { IndexRecord, NormalizedUsage, RecordLocation, ToolUseRef } from './types.js';

/** インデックスが保持する本文プレビューの上限（字）。 */
export const PREVIEW_LIMIT = 200;

/** 初期スコープ外としてインデックスに載せない type。 */
const SKIPPED_TYPES = new Set(['file-history-snapshot', 'queue-operation']);

/** API エラー時などにクライアント側が生成する擬似メッセージの model 値。 */
const SYNTHETIC_MODEL = '<synthetic>';

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 欠損・不正値を 0 とみなす（未知の usage 形でも集計を落とさないため）。 */
function toCount(value: unknown): number {
  return asNumber(value) ?? 0;
}

/** 本文プレビューを PREVIEW_LIMIT 字までに切り詰める。 */
export function truncatePreview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > PREVIEW_LIMIT ? trimmed.slice(0, PREVIEW_LIMIT) : trimmed;
}

/** content ブロック配列（または string）から表示用テキストを取り出す。 */
function textFromContent(content: unknown): string {
  const direct = asString(content);
  if (direct !== undefined) return direct;

  return asArray(content)
    .map((block) => {
      const obj = asObject(block);
      if (!obj) return '';
      if (obj['type'] === 'text') return asString(obj['text']) ?? '';
      return '';
    })
    .filter((t) => t.length > 0)
    .join('\n');
}

function normalizeUsage(raw: unknown): NormalizedUsage {
  const usage = asObject(raw) ?? {};
  const cacheCreation = asObject(usage['cache_creation']) ?? {};
  const serverToolUse = asObject(usage['server_tool_use']) ?? {};

  return {
    input: toCount(usage['input_tokens']),
    output: toCount(usage['output_tokens']),
    cacheRead: toCount(usage['cache_read_input_tokens']),
    cacheCreation: toCount(usage['cache_creation_input_tokens']),
    cacheCreation5m: toCount(cacheCreation['ephemeral_5m_input_tokens']),
    cacheCreation1h: toCount(cacheCreation['ephemeral_1h_input_tokens']),
    webSearch: toCount(serverToolUse['web_search_requests']),
    webFetch: toCount(serverToolUse['web_fetch_requests']),
    serviceTier: asString(usage['service_tier']),
    speed: asString(usage['speed']),
  };
}

/** assistant の content から tool_use を抜き出し、Agent / Skill は input も拾う。 */
function extractToolUses(content: unknown): ToolUseRef[] {
  const toolUses: ToolUseRef[] = [];

  for (const block of asArray(content)) {
    const obj = asObject(block);
    if (!obj || obj['type'] !== 'tool_use') continue;

    const name = asString(obj['name']) ?? '';
    const input = asObject(obj['input']) ?? {};

    toolUses.push({
      id: asString(obj['id']) ?? '',
      name,
      subagentType: name === 'Agent' ? asString(input['subagent_type']) : undefined,
      skill: name === 'Skill' ? asString(input['skill']) : undefined,
    });
  }

  return toolUses;
}

/** 全 type 共通のメタ。欠けていれば undefined のまま残す。 */
function commonFields(raw: Record<string, unknown>, location: RecordLocation) {
  return {
    offset: location.offset,
    length: location.length,
    uuid: asString(raw['uuid']),
    parentUuid: typeof raw['parentUuid'] === 'string' ? (raw['parentUuid'] as string) : null,
    timestamp: asString(raw['timestamp']),
    sessionId: asString(raw['sessionId']) ?? asString(raw['session_id']),
    cwd: asString(raw['cwd']),
    gitBranch: asString(raw['gitBranch']),
    version: asString(raw['version']),
    isSidechain: typeof raw['isSidechain'] === 'boolean' ? (raw['isSidechain'] as boolean) : undefined,
  };
}

/**
 * 1 レコードを正規化する。初期スコープ外の type は null を返す（呼び出し側で捨てる）。
 */
export function normalizeRecord(raw: unknown, location: RecordLocation): IndexRecord | null {
  const obj = asObject(raw);
  if (!obj) return null;

  const type = asString(obj['type']) ?? '';
  if (SKIPPED_TYPES.has(type)) return null;

  const common = commonFields(obj, location);

  switch (type) {
    case 'assistant': {
      const message = asObject(obj['message']) ?? {};
      const content = message['content'];
      const toolUses = extractToolUses(content);
      const model = asString(message['model']);

      return {
        ...common,
        type,
        kind: 'assistant',
        model,
        synthetic: model === SYNTHETIC_MODEL,
        usage: normalizeUsage(message['usage']),
        requestId: asString(obj['requestId']),
        toolUses: toolUses.length > 0 ? toolUses : undefined,
        hasThinking: asArray(content).some((b) => asObject(b)?.['type'] === 'thinking'),
        skill: asString(obj['attributionSkill']) ?? toolUses.find((t) => t.skill)?.skill,
        preview: truncatePreview(textFromContent(content)),
      };
    }

    case 'user': {
      const message = asObject(obj['message']) ?? {};
      const content = message['content'];
      const toolResult = asArray(content)
        .map((b) => asObject(b))
        .find((b) => b?.['type'] === 'tool_result');

      return {
        ...common,
        type,
        kind: 'user',
        isToolResult: toolResult !== undefined,
        toolResultFor: toolResult ? asString(toolResult['tool_use_id']) : undefined,
        preview: truncatePreview(
          toResultText(toolResult) ?? textFromContent(content),
        ),
      };
    }

    case 'system':
      return {
        ...common,
        type,
        kind: 'system',
        subtype: asString(obj['subtype']),
        durationMs: asNumber(obj['durationMs']),
        preview: truncatePreview(textFromContent(obj['content'])),
      };

    case 'attachment':
      return {
        ...common,
        type,
        kind: 'attachment',
        attachmentType: asString(asObject(obj['attachment'])?.['type']),
      };

    case 'pr-link':
      return {
        ...common,
        type,
        kind: 'pr-link',
        prNumber: asNumber(obj['prNumber']),
        prRepository: asString(obj['prRepository']),
        prUrl: asString(obj['prUrl']),
      };

    case 'mode':
    case 'permission-mode':
      return {
        ...common,
        type,
        kind: 'mode',
        mode: asString(obj['mode']) ?? asString(obj['permissionMode']),
      };

    case 'ai-title':
      return { ...common, type, kind: 'title', title: asString(obj['aiTitle']), titleKind: 'ai' };

    case 'custom-title':
      return { ...common, type, kind: 'title', title: asString(obj['customTitle']), titleKind: 'custom' };

    case 'last-prompt':
      return {
        ...common,
        type,
        kind: 'last-prompt',
        leafUuid: asString(obj['leafUuid']),
        preview: truncatePreview(asString(obj['lastPrompt']) ?? ''),
      };

    default:
      // 未知 type は捨てない。将来 Claude Code 側で追加されても取りこぼさないため。
      return { ...common, type, kind: 'unknown' };
  }
}

/** tool_result の content（string または block 配列）からテキストを取り出す。 */
function toResultText(toolResult: Record<string, unknown> | undefined): string | undefined {
  if (!toolResult) return undefined;
  return textFromContent(toolResult['content']);
}
