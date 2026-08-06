/**
 * GET /api/config, /api/pricing。仕様は docs/design/API.md（SPEC-API-060〜061）。
 *
 * settings の permissions 実値はレスポンスに含める（画面には出すが Spec・Issue・PR には
 * 転記しない、が運用規約。サーバは 127.0.0.1 のみなので外部には出ない）。
 */
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Router } from 'express';
import { wrap } from '../http.js';
import type { ApiContext } from '../http.js';

interface DefinitionEntry {
  name: string;
  path: string;
}

/** claudeDir/agents/*.md の一覧。ディレクトリが無ければ空。 */
async function listAgents(claudeDir: string): Promise<DefinitionEntry[]> {
  const dir = join(claudeDir, 'agents');
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => ({ name: basename(e.name, '.md'), path: join(dir, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** claudeDir/skills/<name>/SKILL.md を持つディレクトリの一覧。無ければ空。 */
async function listSkills(claudeDir: string): Promise<DefinitionEntry[]> {
  const dir = join(claudeDir, 'skills');
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: DefinitionEntry[] = [];
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const skillPath = join(dir, entry.name, 'SKILL.md');
    try {
      await readFile(skillPath, 'utf8');
      skills.push({ name: entry.name, path: skillPath });
    } catch {
      // SKILL.md が無いディレクトリはスキルとして数えない
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** claudeDir/plugins 直下のディレクトリ名一覧。無ければ空。 */
async function listPlugins(claudeDir: string): Promise<string[]> {
  try {
    const entries = await readdir(join(claudeDir, 'plugins'), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** settings.json。無い・壊れている場合は null（エラーにしない）。 */
async function readSettings(claudeDir: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function configRoutes(ctx: ApiContext): Router {
  const router = Router();

  router.get(
    '/api/config',
    wrap(async (_req, res) => {
      const [agents, skills, plugins, settings] = await Promise.all([
        listAgents(ctx.claudeDir),
        listSkills(ctx.claudeDir),
        listPlugins(ctx.claudeDir),
        readSettings(ctx.claudeDir),
      ]);
      res.json({ claudeDir: ctx.claudeDir, agents, skills, plugins, settings });
    }),
  );

  router.get(
    '/api/pricing',
    wrap(async (_req, res) => {
      const table = await ctx.loadTable();
      // コストは常に「推定」。表示側が明示できるよう estimated を必ず付ける
      res.json({ estimated: true, ...table });
    }),
  );

  return router;
}
