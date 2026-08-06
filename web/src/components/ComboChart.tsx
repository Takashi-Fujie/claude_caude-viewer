/**
 * 積み上げ棒 + コスト折れ線のコンボチャート（SPEC-DASH-033 / 034）。
 * 仕様は docs/design/DASH.md。dataviz の規律に従う:
 * 二軸グラフにせず x 軸を共有した上下 2 パネル、棒は ≤24px・データ端 4px 丸め、
 * 積み上げセグメント間は 2px のサーフェス gap、折れ線 2px、ツールチップは
 * 帯単位で全系列を一度に出す。文字はデータ色を着ない。
 */
import { useState } from 'react';
import { formatTokens, formatUsd } from '../lib/format';

export interface ComboSeries {
  key: string;
  label: string;
  /** CSS 変数（var(--s1) 等）。 */
  color: string;
  /** days と同じ長さの値配列。 */
  values: number[];
}

export interface ComboChartProps {
  /** YYYY-MM-DD（昇順）。 */
  days: string[];
  series: ComboSeries[];
  /** days と同じ長さの日次推定コスト。 */
  cost: number[];
  /** 選択中の日付（帯ハイライト・再クリック解除の判定に使う）。 */
  selected: string | null;
  onSelectDay: (date: string | null) => void;
}

const W = 1040;
const PAD_L = 52;
const PAD_R = 16;
const TOK_TOP = 8;
const TOK_H = 170;
const GAP_BETWEEN = 44;
const CST_H = 76;
const CST_TOP = TOK_TOP + TOK_H + GAP_BETWEEN;
const H = CST_TOP + CST_H + 28;
const BAR_MAX = 24;
const SEGMENT_GAP = 2;

/** 上端だけ 4px 丸めた棒のパス（データ端を丸め、ベースライン側は角のまま）。 */
function roundedTopRect(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h}`,
    'Z',
  ].join(' ');
}

/** 4 本前後のグリッドに収まる「きりのいい」上限値。 */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (max <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

export function ComboChart({ days, series, cost, selected, onSelectDay }: ComboChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const band = (W - PAD_L - PAD_R) / Math.max(days.length, 1);
  const barW = Math.min(BAR_MAX, band * 0.55);

  const totals = days.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const tokMax = niceMax(Math.max(...totals, 0));
  const costMax = niceMax(Math.max(...cost, 0));

  const xOf = (i: number) => PAD_L + band * i + band / 2;
  const tokY = (v: number) => TOK_TOP + TOK_H - (v / tokMax) * TOK_H;
  const cstY = (v: number) => CST_TOP + CST_H - (v / costMax) * CST_H;

  const costPath = days
    .map((_, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${cstY(cost[i] ?? 0)}`)
    .join(' ');

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const toggle = (date: string) => onSelectDay(selected === date ? null : date);

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="日次トークン積み上げとコスト推移"
        data-testid="combo-chart"
        onMouseLeave={() => setHover(null)}
      >
        {/* 選択帯のハイライト（最背面） */}
        {selected !== null && days.includes(selected) && (
          <rect
            x={PAD_L + band * days.indexOf(selected)}
            y={0}
            width={band}
            height={H - 22}
            rx={6}
            fill="var(--wash)"
          />
        )}
        {hover !== null && hover !== (selected ? days.indexOf(selected) : -1) && (
          <rect x={PAD_L + band * hover} y={0} width={band} height={H - 22} rx={6} fill="var(--wash)" opacity={0.6} />
        )}

        {/* 上段: トークン積み上げ */}
        <g data-testid="tokens-panel">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                y1={tokY(tokMax * t)}
                x2={W - PAD_R}
                y2={tokY(tokMax * t)}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 6}
                y={tokY(tokMax * t) + 3}
                textAnchor="end"
                fontSize={10}
                fill="var(--muted)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatTokens(tokMax * t)}
              </text>
            </g>
          ))}
          {days.map((day, i) => {
            let cursor = tokY(0);
            const x = PAD_L + band * i + (band - barW) / 2;
            const segments = series
              .map((s) => ({ s, value: s.values[i] ?? 0 }))
              .filter(({ value }) => value > 0);
            return (
              <g key={day}>
                {segments.map(({ s, value }, seg) => {
                  const h = (value / tokMax) * TOK_H;
                  const isTop = seg === segments.length - 1;
                  const y = cursor - h;
                  cursor = y - SEGMENT_GAP;
                  return isTop ? (
                    <path key={s.key} data-series={s.key} d={roundedTopRect(x, y, barW, h)} fill={s.color} />
                  ) : (
                    <rect key={s.key} data-series={s.key} x={x} y={y} width={barW} height={h} fill={s.color} />
                  );
                })}
              </g>
            );
          })}
        </g>

        {/* 下段: コスト折れ線（x 軸共有） */}
        <g data-testid="cost-panel">
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                y1={cstY(costMax * t)}
                x2={W - PAD_R}
                y2={cstY(costMax * t)}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 6}
                y={cstY(costMax * t) + 3}
                textAnchor="end"
                fontSize={10}
                fill="var(--muted)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatUsd(costMax * t)}
              </text>
            </g>
          ))}
          <path d={costPath} fill="none" stroke="var(--ink-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <circle cx={xOf(hover)} cy={cstY(cost[hover] ?? 0)} r={4} fill="var(--ink-2)" stroke="var(--surface)" strokeWidth={2} />
          )}
        </g>

        {/* x 軸ラベル（共有） */}
        {days.map((day, i) => (
          <text
            key={day}
            x={xOf(i)}
            y={H - 8}
            textAnchor="middle"
            fontSize={10}
            fill="var(--muted)"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {day.slice(5).replace('-', '/')}
          </text>
        ))}

        {/* 帯単位のヒットターゲット（マークより大きく取る） */}
        {days.map((day, i) => (
          <rect
            key={day}
            data-testid={`band-${day}`}
            x={PAD_L + band * i}
            y={0}
            width={band}
            height={H}
            fill="transparent"
            role="button"
            tabIndex={0}
            aria-label={`${day} で絞り込み`}
            style={{ cursor: 'pointer' }}
            onClick={() => toggle(day)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') toggle(day);
            }}
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {/* ツールチップ: 帯の全系列 + コストを一度に出す（値が主・ラベルが従） */}
      {hover !== null && (
        <div
          className="charttip"
          style={{ left: `${((xOf(hover) + 8) / W) * 100}%` }}
          role="status"
        >
          <div className="d">{days[hover]}</div>
          {series.map((s) => (
            <div className="r" key={s.key}>
              <span>
                <i style={{ background: s.color }} />
                {s.label}
              </span>
              <b>{formatTokens(s.values[hover] ?? 0)}</b>
            </div>
          ))}
          <div className="r">
            <span>コスト（推定）</span>
            <b>{formatUsd(cost[hover] ?? 0)}</b>
          </div>
        </div>
      )}
    </div>
  );
}
