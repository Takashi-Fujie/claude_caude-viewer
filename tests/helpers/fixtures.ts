/**
 * テスト用のフィクスチャ・一時ファイルヘルパ。
 *
 * `session-sample.jsonl` は完全な合成データ（実ログ由来の文字列を含まない）で、
 * 巨大行（50KB 超）・壊れた JSON 行・未知モデル行・`<synthetic>` 行を必ず含む。
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLE_FIXTURE = fileURLToPath(new URL('../fixtures/session-sample.jsonl', import.meta.url));

/** 一時ディレクトリを作って fn に渡し、終了後に必ず削除する。 */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'ccv-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 行オブジェクトの配列を JSONL（末尾改行あり）としてファイルに書く。 */
export async function writeJsonl(path: string, lines: unknown[]): Promise<void> {
  await writeFile(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
}

/** 既存の JSONL に行を追記する（ライブセッションの追記を模す）。 */
export async function appendJsonl(path: string, lines: unknown[]): Promise<void> {
  const current = await readFile(path, 'utf8');
  await writeFile(path, current + lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
}

/** 条件に合う最初の要素を返す。見つからなければテストを失敗させる。 */
export function pick<T>(items: T[], predicate: (item: T) => boolean, label: string): T {
  const found = items.find(predicate);
  if (!found) throw new Error(`該当するレコードが見つかりません: ${label}`);
  return found;
}

/** assistant レコードの合成用ヘルパ。 */
export function assistantLine(over: {
  uuid?: string;
  model?: string;
  content?: unknown[];
  usage?: Record<string, unknown>;
  timestamp?: string;
}): Record<string, unknown> {
  return {
    type: 'assistant',
    uuid: over.uuid ?? 'a-0001',
    parentUuid: null,
    isSidechain: false,
    timestamp: over.timestamp ?? '2026-01-01T00:00:00.000Z',
    sessionId: 's0000000-0000-4000-8000-000000000001',
    requestId: 'req_sample_0001',
    message: {
      id: 'msg_sample_0001',
      role: 'assistant',
      model: over.model ?? 'claude-sonnet-5',
      content: over.content ?? [{ type: 'text', text: 'サンプル応答' }],
      usage: over.usage ?? {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 40,
        cache_creation: { ephemeral_5m_input_tokens: 25, ephemeral_1h_input_tokens: 15 },
        server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
      },
    },
  };
}
