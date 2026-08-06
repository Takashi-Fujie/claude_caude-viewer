/**
 * トークン数・金額・所要時間の表示整形。仕様は docs/design/CHAT.md。
 */

/** 1234 → "1,234"、6400 → "6.4K"、48_200_000 → "48.2M"。 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** 推定コストの表示。0.1 未満は有効数字 3 桁で丸める（$0.0123 など）。 */
export function formatUsd(n: number): string {
  if (n >= 0.1) return `$${n.toFixed(2)}`;
  return `$${String(parseFloat(n.toPrecision(3)))}`;
}

/** 42_000ms → "42 秒"、372_000ms → "6 分 12 秒"。 */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
