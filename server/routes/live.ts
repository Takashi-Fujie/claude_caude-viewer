/**
 * GET /api/live — セッション差分の SSE 配信。仕様は docs/design/LIVE.md（SPEC-LIVE-010〜016）。
 *
 * ここは SSE の書式化と接続ライフサイクルだけを担い、監視・差分計算は LiveHub に委ねる。
 */
import { Router } from 'express';
import { HttpError, queryInt, queryString, wrap } from '../http.js';
import type { ApiContext } from '../http.js';
import type { LiveSentEvent } from '../live.js';

/** アイドル切断（プロキシ等）を防ぐ ping の間隔。 */
const PING_INTERVAL_MS = 25_000;

export function liveRoutes(ctx: ApiContext): Router {
  const router = Router();

  router.get(
    '/api/live',
    wrap(async (req, res) => {
      const sessionId = queryString(req.query['session']);
      const snapshot = await ctx.load();
      const session = sessionId !== undefined ? snapshot.sessionsById.get(sessionId) : undefined;
      if (!session) {
        throw new HttpError(404, `セッションが見つかりません: ${String(sessionId)}`);
      }

      // EventSource の自動再接続が送る Last-Event-ID を have クエリより優先する（SPEC-LIVE-013）
      const lastEventId = req.headers['last-event-id'];
      const have =
        typeof lastEventId === 'string' && /^\d+$/.test(lastEventId)
          ? Number.parseInt(lastEventId, 10)
          : queryInt(req.query['have'], 0);

      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const send = (event: LiveSentEvent): void => {
        const data = event.event === 'append' ? JSON.stringify(event.data) : '{}';
        res.write(`event: ${event.event}\nid: ${String(event.id)}\ndata: ${data}\n\n`);
      };
      const unsubscribe = ctx.hub.subscribe(session.id, session.filePath, have, { send });
      const ping = setInterval(() => res.write(': ping\n\n'), PING_INTERVAL_MS);

      req.on('close', () => {
        clearInterval(ping);
        unsubscribe();
      });
    }),
  );

  return router;
}
