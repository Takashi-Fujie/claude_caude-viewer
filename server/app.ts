/**
 * Express アプリの生成。仕様は docs/design/API.md。
 *
 * logDir / cacheDir / claudeDir を注入可能にし、テストは合成ログの一時ディレクトリで
 * アプリを組み立てる（実ログ ~/.claude に触れない）。listen はここでは行わない
 * （supertest がポート無しで直接叩けるように、bind は server/index.ts の責務）。
 */
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { loadPriceTable } from './cost.js';
import { HttpError } from './http.js';
import type { ApiContext } from './http.js';
import { loadSnapshot } from './store.js';
import { configRoutes } from './routes/config.js';
import { overviewRoutes } from './routes/overview.js';
import { projectRoutes } from './routes/projects.js';
import { searchRoutes } from './routes/search.js';
import { sessionRoutes } from './routes/sessions.js';
import { statsRoutes } from './routes/stats.js';

export interface AppOptions {
  /** セッション JSONL のルート（本番は ~/.claude/projects）。 */
  logDir: string;
  cacheDir: string;
  /** 設定・定義の読み取り元（本番は ~/.claude）。 */
  claudeDir: string;
  /** 価格表のパス。省略時は server/pricing.json。 */
  priceTablePath?: string | undefined;
}

export function createApp(options: AppOptions): Express {
  const ctx: ApiContext = {
    load: () => loadSnapshot({ logDir: options.logDir, cacheDir: options.cacheDir }),
    loadTable: () => loadPriceTable(options.priceTablePath),
    claudeDir: options.claudeDir,
  };

  const app = express();
  app.use(overviewRoutes(ctx));
  app.use(projectRoutes(ctx));
  app.use(sessionRoutes(ctx));
  app.use(searchRoutes(ctx));
  app.use(statsRoutes(ctx));
  app.use(configRoutes(ctx));

  // どのルートにも一致しなかったリクエスト
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `存在しないパスです: ${req.path}` });
  });

  // ハンドラが投げた例外・拒否を JSON へ変換する（サーバは落とさない）
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  });

  return app;
}
