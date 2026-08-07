/**
 * 定義と起動実績の突き合わせ（SPEC-CONFIG-020〜022）。仕様は docs/design/CONFIG.md。
 *
 * 結合は名前の完全一致のみ。起動実績にあって定義に無い名前（ビルトインエージェント・
 * プロジェクト固有定義・`plugin:skill` 形式のプラグイン由来スキル）は正常なので、
 * 結合結果に含めず警告も出さない。
 */
import type { UsageStat } from './types';

export interface JoinedDefinition {
  name: string;
  /** 全セッションでの総起動回数。 */
  count: number;
  lastTimestamp: string | null;
  /** 全期間で起動 0 件のとき true（棚卸し用バッジ）。 */
  unused: boolean;
}

export function joinUsage(definitions: { name: string }[], usage: UsageStat[]): JoinedDefinition[] {
  const byName = new Map(usage.map((u) => [u.name, u]));
  return definitions.map(({ name }) => {
    const stat = byName.get(name);
    return {
      name,
      count: stat?.count ?? 0,
      lastTimestamp: stat?.lastTimestamp ?? null,
      unused: (stat?.count ?? 0) === 0,
    };
  });
}
