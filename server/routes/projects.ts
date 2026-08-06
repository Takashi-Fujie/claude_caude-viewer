/**
 * GET /api/projects, /api/projects/:id。仕様は docs/design/API.md（SPEC-API-020〜022）。
 */
import { Router } from 'express';
import { dailyByModel, filterByRange } from '../aggregate.js';
import { estimateRecordsCost } from '../cost.js';
import { HttpError, parseRange, wrap } from '../http.js';
import type { ApiContext } from '../http.js';
import type { SessionEntry } from '../store.js';
import type { PriceTable } from '../cost.js';
import { projectListItem } from './overview.js';

/** セッション一覧の 1 行。要約から画面が必要とする分だけを写像する。 */
function sessionListItem(session: SessionEntry, table: PriceTable): Record<string, unknown> {
  const summary = session.index.summary;
  let totalTokens = 0;
  for (const totals of Object.values(summary.models)) {
    totalTokens += totals.input + totals.output + totals.cacheRead + totals.cacheCreation;
  }

  return {
    id: session.id,
    title: summary.title ?? null,
    firstTimestamp: summary.firstTimestamp ?? null,
    lastTimestamp: summary.lastTimestamp ?? null,
    recordCount: summary.recordCount,
    skippedLineCount: summary.skippedLineCount,
    totalTokens,
    estimatedCost: estimateRecordsCost(session.index.records, table).total,
    models: Object.keys(summary.models).sort(),
  };
}

export function projectRoutes(ctx: ApiContext): Router {
  const router = Router();

  router.get(
    '/api/projects',
    wrap(async (_req, res) => {
      const [snapshot, table] = await Promise.all([ctx.load(), ctx.loadTable()]);
      res.json(snapshot.projects.map((p) => projectListItem(p, table)));
    }),
  );

  router.get(
    '/api/projects/:id',
    wrap(async (req, res) => {
      const { from, to } = parseRange(req.query);
      const [snapshot, table] = await Promise.all([ctx.load(), ctx.loadTable()]);

      const project = snapshot.projects.find((p) => p.id === req.params['id']);
      if (!project) {
        throw new HttpError(404, `プロジェクトが見つかりません: ${req.params['id']}`);
      }

      const records = filterByRange(
        project.sessions.flatMap((s) => s.index.records),
        from,
        to,
      );

      res.json({
        id: project.id,
        range: { from: from ?? null, to: to ?? null },
        daily: dailyByModel(records),
        sessions: project.sessions.map((s) => sessionListItem(s, table)),
      });
    }),
  );

  return router;
}
