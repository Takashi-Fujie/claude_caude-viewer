/**
 * 会話冒頭の種別チップ凡例（SPEC-CHAT-012）。
 */
import { KindChip } from './KindChip';

export function KindLegend() {
  return (
    <div className="kindlegend">
      <span>使用箇所の凡例:</span>
      <KindChip kind="tool" />
      <KindChip kind="mcp" />
      <KindChip kind="agent" />
      <KindChip kind="skill" />
      <span className="kind k-model">model</span>
    </div>
  );
}
