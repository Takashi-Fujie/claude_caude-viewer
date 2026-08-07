/**
 * ~/.claude 配下の設定・定義の読み取り。仕様は docs/design/CONFIG.md。
 *
 * Claude 固有のファイル構造（frontmatter・installed_plugins.json・history.jsonl）の
 * 解釈はこのモジュールに閉じ込め、routes 側は汎用的な DTO だけを扱う。
 * history.jsonl のプロンプト本文（display / pastedContents）は集計にもレスポンスにも
 * 保持しない（SPEC-CONFIG-013 の漏洩ガード）。
 */
import { createReadStream } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';

export interface AgentDefinition {
  name: string;
  path: string;
  description: string | null;
  /** カンマ区切りを分解した配列。frontmatter に無ければ null（= 全ツール）。 */
  tools: string[] | null;
  model: string | null;
  /** frontmatter 欠落・壊れのとき true。一覧からは落とさない。 */
  parseError: boolean;
}

export interface SkillDefinition {
  name: string;
  path: string;
  description: string | null;
  parseError: boolean;
}

export interface PluginInfo {
  name: string;
  marketplace: string;
}

export interface HistoryProject {
  project: string;
  count: number;
  /** epoch ms を ISO 8601 に変換した値。timestamp が一度も取れなければ null。 */
  lastTimestamp: string | null;
}

interface Frontmatter {
  fields: Record<string, string>;
  error: boolean;
}

/**
 * frontmatter の最小サブセットパーサ。YAML ライブラリは追加しない。
 * 対象は「先頭行 --- 〜 次の ---」内の `key: value` 1 行形式のみ。
 * 値が二重引用符付きなら JSON 文字列として展開する（\n エスケープを実体化）。
 */
export function parseFrontmatter(text: string): Frontmatter {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return { fields: {}, error: true };

  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (end < 0) return { fields: {}, error: true };

  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value) as string;
      } catch {
        // 引用符はあるが JSON として読めない値は素の文字列のまま残す
      }
    }
    fields[key] = value;
  }
  return { fields, error: false };
}

/** claudeDir/agents/*.md の定義一覧。ディレクトリが無ければ空。 */
export async function listAgentDefinitions(claudeDir: string): Promise<AgentDefinition[]> {
  const dir = join(claudeDir, 'agents');
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const agents: AgentDefinition[] = [];
  for (const entry of entries.filter((e) => e.isFile() && e.name.endsWith('.md'))) {
    const path = join(dir, entry.name);
    const fallbackName = basename(entry.name, '.md');
    let front: Frontmatter;
    try {
      front = parseFrontmatter(await readFile(path, 'utf8'));
    } catch {
      front = { fields: {}, error: true };
    }
    const tools = front.fields['tools'];
    agents.push({
      name: front.fields['name'] ?? fallbackName,
      path,
      description: front.fields['description'] ?? null,
      tools: tools === undefined ? null : tools.split(',').map((t) => t.trim()).filter(Boolean),
      model: front.fields['model'] ?? null,
      parseError: front.error,
    });
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

/** claudeDir/skills/<name>/SKILL.md を持つディレクトリの一覧。無ければ空。 */
export async function listSkillDefinitions(claudeDir: string): Promise<SkillDefinition[]> {
  const dir = join(claudeDir, 'skills');
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: SkillDefinition[] = [];
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const path = join(dir, entry.name, 'SKILL.md');
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch {
      continue; // SKILL.md が無いディレクトリはスキルとして数えない
    }
    const front = parseFrontmatter(text);
    skills.push({
      name: entry.name,
      path,
      description: front.fields['description'] ?? null,
      parseError: front.error,
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * plugins/installed_plugins.json のキー `name@marketplace` を分解した一覧。
 * ファイルが無い・壊れている場合は空（ディレクトリ名の羅列にはフォールバックしない）。
 */
export async function listInstalledPlugins(claudeDir: string): Promise<PluginInfo[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(claudeDir, 'plugins', 'installed_plugins.json'), 'utf8'));
  } catch {
    return [];
  }

  const plugins = (parsed as { plugins?: unknown }).plugins;
  if (plugins === null || typeof plugins !== 'object') return [];

  return Object.keys(plugins as Record<string, unknown>)
    .map((key) => {
      const at = key.lastIndexOf('@');
      return at > 0
        ? { name: key.slice(0, at), marketplace: key.slice(at + 1) }
        : { name: key, marketplace: '' };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** settings.json。無い・壊れている場合は null（エラーにしない）。 */
export async function readSettings(claudeDir: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * history.jsonl をストリーム走査し、プロジェクト別の件数と最終利用日時を集計する。
 * 壊れた行・project が文字列でない行はスキップして継続する。
 */
export async function aggregateHistory(claudeDir: string): Promise<HistoryProject[]> {
  const path = join(claudeDir, 'history.jsonl');
  const totals = new Map<string, { count: number; lastMs: number | null }>();

  try {
    const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) {
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const { project, timestamp } = entry as { project?: unknown; timestamp?: unknown };
      if (typeof project !== 'string' || project === '') continue;

      const total = totals.get(project) ?? { count: 0, lastMs: null };
      total.count += 1;
      if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
        total.lastMs = total.lastMs === null ? timestamp : Math.max(total.lastMs, timestamp);
      }
      totals.set(project, total);
    }
  } catch {
    return [];
  }

  return [...totals.entries()]
    .map(([project, { count, lastMs }]) => ({
      project,
      count,
      lastTimestamp: lastMs === null ? null : new Date(lastMs).toISOString(),
    }))
    .sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''));
}
