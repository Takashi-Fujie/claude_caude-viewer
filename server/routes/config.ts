/**
 * GET /api/config, /api/pricing。仕様は docs/design/API.md（SPEC-API-060〜061）と
 * docs/design/CONFIG.md（読み取りの中身）。
 *
 * settings の permissions 実値・履歴の集計値はレスポンスに含める（画面には出すが
 * Spec・Issue・PR には転記しない、が運用規約。サーバは 127.0.0.1 のみなので外部には出ない）。
 */
import { Router } from 'express';
import {
  aggregateHistory,
  listAgentDefinitions,
  listInstalledPlugins,
  listSkillDefinitions,
  readSettings,
} from '../claude-config.js';
import { wrap } from '../http.js';
import type { ApiContext } from '../http.js';

export function configRoutes(ctx: ApiContext): Router {
  const router = Router();

  router.get(
    '/api/config',
    wrap(async (_req, res) => {
      const [agents, skills, plugins, settings, history] = await Promise.all([
        listAgentDefinitions(ctx.claudeDir),
        listSkillDefinitions(ctx.claudeDir),
        listInstalledPlugins(ctx.claudeDir),
        readSettings(ctx.claudeDir),
        aggregateHistory(ctx.claudeDir),
      ]);
      res.json({ claudeDir: ctx.claudeDir, agents, skills, plugins, settings, history });
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
