/**
 * 表示行への平坦化と sidechain 分離（SPEC-CHAT-020/025/030）。仕様は docs/design/CHAT.md。
 */
import { describe, expect, it } from 'vitest';
import { buildRows } from '../../../web/src/lib/thread';
import type { MessageMeta } from '../../../web/src/lib/types';

let seq = 0;

function meta(over: Partial<MessageMeta>): MessageMeta {
  seq += 1;
  return {
    index: over.index ?? seq,
    offset: seq * 100,
    length: 100,
    type: over.kind ?? 'user',
    kind: 'user',
    ...over,
  } as MessageMeta;
}

describe('buildRows', () => {
  it('SPEC-CHAT-020: tool_use と tool_result を tool_use_id で対応付け、独立した行にしない', () => {
    const assistant = meta({
      index: 0,
      kind: 'assistant',
      uuid: 'a1',
      toolUses: [{ id: 'tu1', name: 'Bash' }],
    });
    const result = meta({
      index: 1,
      kind: 'user',
      uuid: 'u1',
      isToolResult: true,
      toolResultFor: 'tu1',
    });

    const rows = buildRows([assistant, result]);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row?.type !== 'message') throw new Error('message 行が先頭にありません');
    expect(row.record.uuid).toBe('a1');
    expect(row.toolResults['tu1']?.uuid).toBe('u1');
  });

  it('SPEC-CHAT-025: メイン列・区切り・sidechain グループを 1 次元の行配列へ平坦化する', () => {
    const records = [
      meta({ index: 0, kind: 'user', uuid: 'u1', preview: '調べて' }),
      meta({ index: 1, kind: 'assistant', uuid: 'a1' }),
      meta({ index: 2, kind: 'system', subtype: 'turn_duration', durationMs: 42_000 }),
      meta({ index: 3, kind: 'title', title: '無関係なメタ行' }),
      meta({ index: 4, kind: 'system', subtype: 'compact_boundary' }),
      meta({ index: 5, kind: 'user', uuid: 'u2', preview: '続けて' }),
    ];

    expect(buildRows(records).map((r) => r.type)).toEqual([
      'message',
      'message',
      'turn',
      'compact',
      'message',
    ]);
  });

  it('SPEC-CHAT-030: isSidechain のレコードを parentUuid で連結して分岐にまとめる', () => {
    const records = [
      meta({ index: 0, kind: 'user', uuid: 'u1' }),
      meta({ index: 1, kind: 'assistant', uuid: 'a1', toolUses: [{ id: 'tu1', name: 'Agent', subagentType: 'Explore' }] }),
      meta({ index: 2, kind: 'user', uuid: 's1', parentUuid: null, isSidechain: true, preview: '洗い出して' }),
      meta({ index: 3, kind: 'assistant', uuid: 's2', parentUuid: 's1', isSidechain: true, model: 'claude-haiku-4-5' }),
      meta({ index: 4, kind: 'assistant', uuid: 'a2', parentUuid: 'a1' }),
      // 2 本目の分岐（並列 subagent の interleave を模す）
      meta({ index: 5, kind: 'user', uuid: 's3', parentUuid: null, isSidechain: true }),
    ];

    const rows = buildRows(records);

    expect(rows.map((r) => r.type)).toEqual(['message', 'message', 'sidechain', 'message', 'sidechain']);
    const branch = rows[2];
    if (branch?.type !== 'sidechain') throw new Error('sidechain 行がありません');
    expect(branch.records.map((r) => r.uuid)).toEqual(['s1', 's2']);
  });
});
