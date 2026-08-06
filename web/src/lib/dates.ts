/**
 * 期間プリセットのローカル日付計算（SPEC-DASH-031）。仕様は docs/design/DASH.md。
 *
 * 日付は常に YYYY-MM-DD 文字列で受け渡す。Date の内部表現に頼るのは UTC 固定の
 * 計算だけにして、実行環境のタイムゾーンに依存しない決定的な関数に保つ。
 */

export type PresetKey = 'today' | '7d' | '30d' | '90d' | 'mtd';

export interface DateRange {
  from: string;
  to: string;
}

/** 画面に並べる順の正本。 */
export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: '7d', label: '7日' },
  { key: '30d', label: '30日' },
  { key: '90d', label: '90日' },
  { key: 'mtd', label: '月初来' },
];

/** YYYY-MM-DD から days 日引く（UTC 固定計算・環境非依存）。 */
function minusDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - days);
  return parsed.toISOString().slice(0, 10);
}

/** プリセットを基準日（ローカル日付・YYYY-MM-DD）からの閉区間へ展開する。 */
export function presetRange(preset: PresetKey, today: string): DateRange {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: minusDays(today, 6), to: today };
    case '30d':
      return { from: minusDays(today, 29), to: today };
    case '90d':
      return { from: minusDays(today, 89), to: today };
    case 'mtd':
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

/** ブラウザのローカル日付（YYYY-MM-DD）。 */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** サーバへ渡す tzOffset（分・UTC からの東向き。JST = 540）。 */
export function tzOffsetMinutes(now: Date = new Date()): number {
  return -now.getTimezoneOffset();
}
