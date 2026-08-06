/**
 * ドーナツ + 凡例（SPEC-DASH-032）。仕様は docs/design/DASH.md。
 * セグメント間は 2px のサーフェス gap。文字は ink 系トークンのみ（色はマークが持つ）。
 */
export interface DonutItem {
  label: string;
  color: string;
  value: number;
}

export interface DonutProps {
  title: string;
  items: DonutItem[];
  /** 値の表示整形（トークン / 金額で切り替える）。 */
  format: (value: number) => string;
  testId?: string;
}

const SIZE = 112;
const R = 44;
const STROKE = 16;
const C = 2 * Math.PI * R;
/** セグメント間 2px 相当の gap（円周に対する長さ）。 */
const GAP = 2;

export function Donut({ title, items, format, testId }: DonutProps) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const visible = items.filter((item) => item.value > 0);

  let offset = 0;
  const segments = visible.map((item) => {
    const length = total > 0 ? (item.value / total) * C : 0;
    const segment = { ...item, length, offset };
    offset += length;
    return segment;
  });

  return (
    <div className="donut" data-testid={testId}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={title}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--grid)" strokeWidth={STROKE} />
        {segments.map((seg) => (
          <circle
            key={seg.label}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE}
            strokeDasharray={`${Math.max(seg.length - GAP, 0)} ${C - Math.max(seg.length - GAP, 0)}`}
            strokeDashoffset={-seg.offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        ))}
      </svg>
      <div className="dlegend">
        <div className="t">{title}</div>
        {items.map((item) => (
          <div className="r" key={item.label}>
            <i style={{ background: item.color }} />
            <span>{item.label}</span>
            <span className="pct">
              {format(item.value)}
              {total > 0 && ` · ${Math.round((item.value / total) * 100)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
