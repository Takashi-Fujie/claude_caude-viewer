/**
 * GET /api/stats/*。仕様は docs/design/API.md（SPEC-API-050〜052）。
 */
import { Router } from 'express';
import { modelDateRows } from '../aggregate.js';
import { wrap } from '../http.js';
import type { ApiContext } from '../http.js';
import type { SessionSummary } from '../core/types.js';

interface NameCount {
  name: string;
  count: number;
}

/** セッション要約のカウンタを横断合算し、回数降順（同数は名前昇順）で返す。 */
function mergeCounts(
  summaries: SessionSummary[],
  pick: (summary: SessionSummary) => Record<string, number>,
): NameCount[] {
  const merged: Record<string, number> = {};
  for (const summary of summaries) {
    for (const [name, count] of Object.entries(pick(summary))) {
      merged[name] = (merged[name] ?? 0) + count;
    }
  }
  return Object.entries(merged)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function statsRoutes(ctx: ApiContext): Router {
  const router = Router();

  router.get(
    '/api/stats/tokens',
    wrap(async (_req, res) => {
      const snapshot = await ctx.load();
      const records = snapshot.projects.flatMap((p) => p.sessions.flatMap((s) => s.index.records));
      res.json(modelDateRows(records));
    }),
  );

  router.get(
    '/api/stats/tools',
    wrap(async (_req, res) => {
      const snapshot = await ctx.load();
      const summaries = snapshot.projects.flatMap((p) => p.sessions.map((s) => s.index.summary));
      res.json(mergeCounts(summaries, (s) => s.toolUseCounts));
    }),
  );

  router.get(
    '/api/stats/agents',
    wrap(async (_req, res) => {
      const snapshot = await ctx.load();
      const summaries = snapshot.projects.flatMap((p) => p.sessions.map((s) => s.index.summary));
      res.json({
        subagents: mergeCounts(summaries, (s) => s.subagentTypes),
        skills: mergeCounts(summaries, (s) => s.skills),
      });
    }),
  );

  return router;
}
