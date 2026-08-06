/**
 * やりとり別コスト棒グラフ（SPEC-CHAT-044/045）。
 * 帯クリックで絞り込み・再クリックで解除。compact 済みはグレーでクリック不可。
 */
import { formatUsd } from '../lib/format';
import type { Exchange } from '../lib/exchanges';

export interface TurnCostChartProps {
  exchanges: Exchange[];
  selected: number | null;
  onSelect: (index: number | null) => void;
}

const W = 960;
const H = 150;
const PAD_L = 46;
const PAD_B = 22;
const PLOT_H = H - PAD_B - 8;

export function TurnCostChart({ exchanges, selected, onSelect }: TurnCostChartProps) {
  if (exchanges.length === 0) return null;

  const max = Math.max(...exchanges.map((e) => e.total), 1e-9);
  const band = (W - PAD_L - 6) / exchanges.length;
  const barW = Math.min(26, band * 0.6);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="ユーザー入力ごとの推定コスト棒グラフ"
    >
      <line x1={PAD_L} y1={8 + PLOT_H} x2={W - 6} y2={8 + PLOT_H} stroke="var(--baseline)" />
      <text x={PAD_L - 6} y={14} textAnchor="end" fontSize="10" fill="var(--muted)">
        {formatUsd(max)}
      </text>
      {exchanges.map((exchange, i) => {
        const h = (exchange.total / max) * PLOT_H;
        const x = PAD_L + band * i;
        const isSelected = selected === exchange.index;
        return (
          <g
            key={exchange.index}
            data-testid={`turn-band-${exchange.index}`}
            style={{ cursor: exchange.compacted ? 'default' : 'pointer' }}
            onClick={() => {
              if (exchange.compacted) return;
              onSelect(isSelected ? null : exchange.index);
            }}
          >
            {isSelected && <rect x={x} y={0} width={band} height={H - PAD_B + 4} fill="var(--wash)" rx={4} />}
            <rect x={x} y={0} width={band} height={H - PAD_B + 4} fill="transparent" />
            <rect
              x={x + (band - barW) / 2}
              y={8 + PLOT_H - h}
              width={barW}
              height={h}
              fill={exchange.compacted ? 'var(--baseline)' : 'var(--s1)'}
              rx={2}
            />
            <text
              x={x + band / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize="9"
              fill="var(--muted)"
            >
              #{exchange.index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
