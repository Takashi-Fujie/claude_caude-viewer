/**
 * ログディレクトリのスナップショット構築。仕様は docs/design/API.md。
 *
 * リクエストごとに buildIndex() を呼ぶ。鮮度管理（reuse / incremental / rebuild）は
 * SPEC-CORE の decideStrategy に委ねるため、ここでは TTL を持たない
 * （変更が無ければ stat のコストだけで最新のインデックスが得られる）。
 */
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { buildIndex } from './core/indexer.js';
import type { SessionIndex } from './core/types.js';

export interface SessionEntry {
  /** ファイル名から拡張子を除いたもの。API の session id。 */
  id: string;
  projectId: string;
  filePath: string;
  index: SessionIndex;
}

export interface ProjectEntry {
  /** ~/.claude/projects 直下のディレクトリ名。API の project id。 */
  id: string;
  sessions: SessionEntry[];
}

export interface Snapshot {
  projects: ProjectEntry[];
  sessionsById: Map<string, SessionEntry>;
}

export interface StoreOptions {
  logDir: string;
  cacheDir: string;
}

/**
 * logDir 配下の全プロジェクト・全セッションのインデックスを構築する。
 * logDir が無い場合は空のスナップショットを返す（エラーにしない）。
 */
export async function loadSnapshot(options: StoreOptions): Promise<Snapshot> {
  let dirents;
  try {
    dirents = await readdir(options.logDir, { withFileTypes: true });
  } catch {
    return { projects: [], sessionsById: new Map() };
  }

  const projects: ProjectEntry[] = [];
  const sessionsById = new Map<string, SessionEntry>();

  const dirs = dirents.filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  for (const dir of dirs) {
    const projectDir = join(options.logDir, dir.name);
    // サブディレクトリ（subagent の JSONL 置き場）も含めて再帰列挙する
    const entries = await readdir(projectDir, { recursive: true, withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
      .map((e) => join(e.parentPath, e.name))
      .sort();

    const sessions: SessionEntry[] = [];
    for (const filePath of files) {
      const { index } = await buildIndex(filePath, { cacheDir: options.cacheDir });
      const entry: SessionEntry = {
        id: basename(filePath, '.jsonl'),
        projectId: dir.name,
        filePath,
        index,
      };
      sessions.push(entry);
      sessionsById.set(entry.id, entry);
    }

    projects.push({ id: dir.name, sessions });
  }

  return { projects, sessionsById };
}
