/**
 * セッション分析画面のヘッダ（SPEC-CHAT-002/003）。
 */
import { formatTokens, formatUsd } from '../lib/format';
import type { SessionSummary } from '../lib/types';

export interface SessionHeaderProps {
  title: string;
  summary: SessionSummary;
  costTotal: number;
  unknownModels: string[];
  subline?: string | undefined;
}

export function SessionHeader({ title, summary, costTotal, unknownModels, subline }: SessionHeaderProps) {
  const models = Object.keys(summary.models);
  const totalTokens = Object.values(summary.models).reduce(
    (a, m) => a + m.input + m.output + m.cacheRead + m.cacheCreation,
    0,
  );

  return (
    <div className="chathead">
      <span className="t">{title}</span>
      {models.map((model) => (
        <span key={model} className="badge">
          {model}
        </span>
      ))}
      <span className="badge">合計 {formatTokens(totalTokens)} tok</span>
      <span className="badge">{formatUsd(costTotal)} 推定</span>
      {summary.skippedLineCount > 0 && (
        <span className="badge warn">⚠ 破損 {summary.skippedLineCount} 行スキップ</span>
      )}
      {unknownModels.length > 0 && (
        <span className="badge warn">⚠ 未知モデル {unknownModels.length} 件（コスト未計上）</span>
      )}
      {subline !== undefined && <div className="sub mono">{subline}</div>}
    </div>
  );
}
