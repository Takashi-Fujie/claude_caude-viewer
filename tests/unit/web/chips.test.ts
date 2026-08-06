/**
 * 種別チップの分類（SPEC-CHAT-010/011）。仕様は docs/design/CHAT.md。
 */
import { describe, expect, it } from 'vitest';
import { classifyTool } from '../../../web/src/lib/chips';

describe('classifyTool', () => {
  it('SPEC-CHAT-010: mcp__<server>__<tool> を MCP としてサーバ名・ツール名に分解する', () => {
    expect(classifyTool({ id: 't1', name: 'mcp__github__create_pr' })).toEqual({
      kind: 'mcp',
      server: 'github',
      tool: 'create_pr',
    });
    // サーバ名にハイフン・ツール名にアンダースコアが混ざっても最初の 2 区切りで分解する
    expect(classifyTool({ id: 't2', name: 'mcp__db-inspector__run_query' })).toEqual({
      kind: 'mcp',
      server: 'db-inspector',
      tool: 'run_query',
    });
  });

  it('SPEC-CHAT-011: Agent は agent、Skill は skill、それ以外は tool に分類する', () => {
    expect(classifyTool({ id: 't1', name: 'Agent', subagentType: 'Explore' })).toEqual({
      kind: 'agent',
      name: 'Explore',
    });
    expect(classifyTool({ id: 't2', name: 'Skill', skill: 'dev-cycle' })).toEqual({
      kind: 'skill',
      name: 'dev-cycle',
    });
    expect(classifyTool({ id: 't3', name: 'Read' })).toEqual({ kind: 'tool', name: 'Read' });
    // subagent_type が取れなくても agent として扱う（名前はツール名で代用）
    expect(classifyTool({ id: 't4', name: 'Agent' })).toEqual({ kind: 'agent', name: 'Agent' });
  });
});
