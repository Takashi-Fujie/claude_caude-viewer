/**
 * MCP サーバ / subagent / Skill の一覧（SPEC-CHAT-051）。
 * MCP は mcp__<server>__<tool> をサーバ名で束ね、主なツール名を備考に出す。
 */
import { classifyTool } from '../lib/chips';
import type { SessionSummary } from '../lib/types';

interface UsageRow {
  type: 'MCP' | 'subagent' | 'skill';
  name: string;
  count: number;
  note: string;
}

export function buildUsageRows(summary: SessionSummary): UsageRow[] {
  const mcp = new Map<string, { count: number; tools: Set<string> }>();
  for (const [name, count] of Object.entries(summary.toolUseCounts)) {
    const chip = classifyTool({ id: '', name });
    if (chip.kind !== 'mcp') continue;
    const entry = mcp.get(chip.server) ?? { count: 0, tools: new Set() };
    entry.count += count;
    entry.tools.add(chip.tool);
    mcp.set(chip.server, entry);
  }

  return [
    ...[...mcp.entries()].map(
      ([server, e]): UsageRow => ({
        type: 'MCP',
        name: server,
        count: e.count,
        note: [...e.tools].join(', '),
      }),
    ),
    ...Object.entries(summary.subagentTypes).map(
      ([name, count]): UsageRow => ({ type: 'subagent', name, count, note: '' }),
    ),
    ...Object.entries(summary.skills).map(
      ([name, count]): UsageRow => ({ type: 'skill', name, count, note: '' }),
    ),
  ];
}

export function UsageTable({ summary }: { summary: SessionSummary }) {
  const rows = buildUsageRows(summary);
  if (rows.length === 0) return <div className="note">MCP / subagent / Skill の利用はありません</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>種別</th>
          <th>名前</th>
          <th className="num">回数</th>
          <th>備考</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.type}-${row.name}`}>
            <td>{row.type}</td>
            <td className="mono">{row.name}</td>
            <td className="num">{row.count}</td>
            <td className="mono">{row.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
