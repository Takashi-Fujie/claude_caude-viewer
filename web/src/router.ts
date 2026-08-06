/**
 * ハッシュルーティング（SPEC-CHAT-001 / SPEC-DASH-030）。仕様は docs/design/DASH.md。
 *
 * Express 側に SPA fallback を持たせないため、画面遷移は location.hash だけで表す。
 * #/ が Overview（起点）、#/tools が Tools & Agents。プロジェクト・セッションは
 * ドリルダウン先でナビ項目ではない。
 */
export type Route =
  | { view: 'overview' }
  | { view: 'tools' }
  | { view: 'sessions'; projectId: string }
  | { view: 'session'; projectId: string; sessionId: string };

export function parseRoute(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter((p) => p.length > 0);

  if (parts[0] === 'tools') return { view: 'tools' };

  if (parts[0] === 'projects' && parts[1]) {
    const projectId = decodeURIComponent(parts[1]);
    if (parts[2] === 'sessions' && parts[3]) {
      return { view: 'session', projectId, sessionId: decodeURIComponent(parts[3]) };
    }
    return { view: 'sessions', projectId };
  }

  return { view: 'overview' };
}

export function routeHash(route: Route): string {
  switch (route.view) {
    case 'overview':
      return '#/';
    case 'tools':
      return '#/tools';
    case 'sessions':
      return `#/projects/${encodeURIComponent(route.projectId)}`;
    case 'session':
      return `#/projects/${encodeURIComponent(route.projectId)}/sessions/${encodeURIComponent(route.sessionId)}`;
  }
}
