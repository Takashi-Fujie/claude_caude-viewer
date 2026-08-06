/**
 * 種別チップ（SPEC-CHAT-010/011/012）。文字は常に ink、色はドットだけが持つ
 * （モックの text-never-wears-data-color の規律に従う）。
 */
import type { Chip } from '../lib/chips';

const LABELS = { tool: 'tool', mcp: 'MCP', agent: 'agent', skill: 'skill' } as const;

/** 使用種別（tool / MCP / agent / skill）の色ドット付きチップ。 */
export function KindChip({ kind }: { kind: Chip['kind'] }) {
  return <span className={`kind k-${kind}`}>{LABELS[kind]}</span>;
}

/** モデル名チップ。色ドットは持たない。 */
export function ModelChip({ model }: { model: string }) {
  return <span className="kind k-model">{model}</span>;
}
