/**
 * 種別チップの分類（SPEC-CHAT-010/011）。仕様は docs/design/CHAT.md。
 */
import type { ToolUseRef } from '../../../server/core/types';

export type Chip =
  | { kind: 'mcp'; server: string; tool: string }
  | { kind: 'agent' | 'skill' | 'tool'; name: string };

const MCP_PREFIX = 'mcp__';

/** ツール呼び出しを表示種別へ分類する。MCP はサーバ名・ツール名に分解する。 */
export function classifyTool(ref: ToolUseRef): Chip {
  if (ref.name.startsWith(MCP_PREFIX)) {
    const rest = ref.name.slice(MCP_PREFIX.length);
    const sep = rest.indexOf('__');
    if (sep > 0) {
      return { kind: 'mcp', server: rest.slice(0, sep), tool: rest.slice(sep + 2) };
    }
  }
  if (ref.name === 'Agent') return { kind: 'agent', name: ref.subagentType ?? ref.name };
  if (ref.name === 'Skill') return { kind: 'skill', name: ref.skill ?? ref.name };
  return { kind: 'tool', name: ref.name };
}
