/**
 * レコード正規化のテスト。仕様は docs/spec/SPEC-CORE.md。
 *
 * 入力の形は `~/.claude/projects` 配下 15 ファイル・11,378 行の実測に基づく合成データ。
 */
import { describe, it, expect } from 'vitest';
import { normalizeRecord } from '../../../server/core/normalize.js';
import { assistantLine } from '../../helpers/fixtures.js';

const at = { offset: 100, length: 42 };

/** normalizeRecord がスキップ（null）を返さないことを保証して取り出す。 */
function normalize(raw: unknown) {
  const record = normalizeRecord(raw, at);
  if (!record) throw new Error('スキップされないはずのレコードが null になりました');
  return record;
}

describe('assistant', () => {
  it('SPEC-CORE-010: model / requestId / isSidechain を取り出す', () => {
    const record = normalize({ ...assistantLine({ model: 'claude-opus-5' }), isSidechain: true });

    expect(record.kind).toBe('assistant');
    expect(record.offset).toBe(at.offset);
    expect(record.length).toBe(at.length);
    expect(record.model).toBe('claude-opus-5');
    expect(record.requestId).toBe('req_sample_0001');
    expect(record.isSidechain).toBe(true);
    expect(record.timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  it('SPEC-CORE-011: content から thinking / text / tool_use を判別し tool_use の id と name を保持する', () => {
    const record = normalize(
      assistantLine({
        content: [
          { type: 'thinking', thinking: '思考' },
          { type: 'text', text: '応答テキスト' },
          { type: 'tool_use', id: 'toolu_sample_0001', name: 'Read', input: { file_path: '/tmp/a.ts' } },
          { type: 'tool_use', id: 'toolu_sample_0002', name: 'Bash', input: { command: 'ls' } },
        ],
      }),
    );

    expect(record.hasThinking).toBe(true);
    expect(record.preview).toBe('応答テキスト');
    expect(record.toolUses).toEqual([
      { id: 'toolu_sample_0001', name: 'Read' },
      { id: 'toolu_sample_0002', name: 'Bash' },
    ]);
  });

  it('SPEC-CORE-012: usage の cache_creation を 5m / 1h に分けて保持する', () => {
    const record = normalize(
      assistantLine({
        usage: {
          input_tokens: 11,
          output_tokens: 22,
          cache_read_input_tokens: 33,
          cache_creation_input_tokens: 44,
          cache_creation: { ephemeral_5m_input_tokens: 30, ephemeral_1h_input_tokens: 14 },
        },
      }),
    );

    expect(record.usage).toMatchObject({
      input: 11,
      output: 22,
      cacheRead: 33,
      cacheCreation: 44,
      cacheCreation5m: 30,
      cacheCreation1h: 14,
    });
  });

  it('SPEC-CORE-012: usage が欠けていても 0 で埋めて例外にしない', () => {
    const record = normalize(assistantLine({ usage: {} }));

    expect(record.usage).toMatchObject({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
      cacheCreation5m: 0,
      cacheCreation1h: 0,
    });
  });

  it('SPEC-CORE-013: usage の server_tool_use から web_search / web_fetch 回数を取り出す', () => {
    const record = normalize(
      assistantLine({
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          server_tool_use: { web_search_requests: 3, web_fetch_requests: 2 },
        },
      }),
    );

    expect(record.usage?.webSearch).toBe(3);
    expect(record.usage?.webFetch).toBe(2);
  });

  it('SPEC-CORE-014: model が <synthetic> の行は synthetic フラグを立てる', () => {
    expect(normalize(assistantLine({ model: '<synthetic>' })).synthetic).toBe(true);
    expect(normalize(assistantLine({ model: 'claude-sonnet-5' })).synthetic).toBe(false);
  });

  it('SPEC-CORE-024: Agent tool_use の input.subagent_type をサブエージェント起動として抽出する', () => {
    const record = normalize(
      assistantLine({
        content: [
          { type: 'tool_use', id: 'toolu_sample_0002', name: 'Agent', input: { subagent_type: 'sample-reviewer' } },
        ],
      }),
    );

    expect(record.toolUses).toEqual([
      { id: 'toolu_sample_0002', name: 'Agent', subagentType: 'sample-reviewer' },
    ]);
  });

  it('SPEC-CORE-025: Skill tool_use の input.skill と attributionSkill を skill 利用として抽出する', () => {
    const viaTool = normalize(
      assistantLine({
        content: [{ type: 'tool_use', id: 'toolu_sample_0003', name: 'Skill', input: { skill: 'sample-skill' } }],
      }),
    );
    const viaAttribution = normalize({ ...assistantLine({}), attributionSkill: 'other-skill' });

    expect(viaTool.toolUses).toEqual([{ id: 'toolu_sample_0003', name: 'Skill', skill: 'sample-skill' }]);
    expect(viaTool.skill).toBe('sample-skill');
    expect(viaAttribution.skill).toBe('other-skill');
  });
});

describe('user', () => {
  const userLine = (content: unknown) => ({
    type: 'user',
    uuid: 'u-0001',
    parentUuid: 'a-0001',
    timestamp: '2026-01-01T00:00:01.000Z',
    message: { role: 'user', content },
  });

  it('SPEC-CORE-015: content が string の場合はそのままプレビューにする', () => {
    const record = normalize(userLine('サンプルの依頼文。'));

    expect(record.kind).toBe('user');
    expect(record.preview).toBe('サンプルの依頼文。');
    expect(record.isToolResult).toBe(false);
  });

  it('SPEC-CORE-015: content が配列の場合は text ブロックを連結してプレビューにする', () => {
    const record = normalize(
      userLine([
        { type: 'text', text: '画像つきの依頼' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      ]),
    );

    expect(record.preview).toBe('画像つきの依頼');
  });

  it('SPEC-CORE-016: tool_result は対応する tool_use_id を保持する', () => {
    const record = normalize(
      userLine([{ type: 'tool_result', tool_use_id: 'toolu_sample_0001', content: 'ツールの出力' }]),
    );

    expect(record.isToolResult).toBe(true);
    expect(record.toolResultFor).toBe('toolu_sample_0001');
    expect(record.preview).toBe('ツールの出力');
  });
});

describe('その他のレコード型', () => {
  it('SPEC-CORE-017: system は subtype と durationMs を保持する', () => {
    const record = normalize({
      type: 'system',
      uuid: 's-0001',
      timestamp: '2026-01-01T00:00:09.000Z',
      subtype: 'turn_duration',
      durationMs: 4321,
    });

    expect(record.kind).toBe('system');
    expect(record.subtype).toBe('turn_duration');
    expect(record.durationMs).toBe(4321);
  });

  it('SPEC-CORE-018: attachment は attachment.type を保持する', () => {
    const record = normalize({
      type: 'attachment',
      uuid: 'at-0001',
      attachment: { type: 'task_reminder', content: 'リマインダ' },
    });

    expect(record.kind).toBe('attachment');
    expect(record.attachmentType).toBe('task_reminder');
  });

  it('SPEC-CORE-019: pr-link は prNumber / prRepository / prUrl を保持する', () => {
    const record = normalize({
      type: 'pr-link',
      sessionId: 's-1',
      prNumber: 42,
      prUrl: 'https://example.invalid/owner/repo/pull/42',
      prRepository: 'owner/repo',
    });

    expect(record.kind).toBe('pr-link');
    expect(record.prNumber).toBe(42);
    expect(record.prRepository).toBe('owner/repo');
    expect(record.prUrl).toBe('https://example.invalid/owner/repo/pull/42');
  });

  it('SPEC-CORE-020: mode / permission-mode は mode 値を保持する', () => {
    expect(normalize({ type: 'mode', mode: 'default' })).toMatchObject({ kind: 'mode', mode: 'default' });
    expect(normalize({ type: 'permission-mode', permissionMode: 'acceptEdits' })).toMatchObject({
      kind: 'mode',
      mode: 'acceptEdits',
    });
  });

  it('SPEC-CORE-021: ai-title / custom-title を title として保持し種別を区別する', () => {
    expect(normalize({ type: 'ai-title', aiTitle: 'AI 生成タイトル' })).toMatchObject({
      kind: 'title',
      title: 'AI 生成タイトル',
      titleKind: 'ai',
    });
    expect(normalize({ type: 'custom-title', customTitle: '手動タイトル' })).toMatchObject({
      kind: 'title',
      title: '手動タイトル',
      titleKind: 'custom',
    });
  });

  it('SPEC-CORE-021: last-prompt は leafUuid とプレビューを保持する', () => {
    const record = normalize({ type: 'last-prompt', lastPrompt: '直前のプロンプト', leafUuid: 'a-0005' });

    expect(record.kind).toBe('last-prompt');
    expect(record.preview).toBe('直前のプロンプト');
    expect(record.leafUuid).toBe('a-0005');
  });

  it('SPEC-CORE-022: file-history-snapshot / queue-operation はスキップする', () => {
    expect(normalizeRecord({ type: 'file-history-snapshot', messageId: 'm1', snapshot: {} }, at)).toBeNull();
    expect(normalizeRecord({ type: 'queue-operation', operation: 'add' }, at)).toBeNull();
  });

  it('SPEC-CORE-023: 未知の type も unknown 分類で保持しレコードを捨てない', () => {
    const record = normalize({ type: 'future-record-type', uuid: 'x-0001', payload: { note: 'n' } });

    expect(record.kind).toBe('unknown');
    expect(record.type).toBe('future-record-type');
    expect(record.uuid).toBe('x-0001');
  });

  it('SPEC-CORE-023: type を持たない行も unknown として保持する', () => {
    const record = normalize({ foo: 'bar' });

    expect(record.kind).toBe('unknown');
    expect(record.type).toBe('');
  });
});
