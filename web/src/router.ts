/**
 * ハッシュルーティング（SPEC-CHAT-001）。仕様は docs/design/CHAT.md。
 *
 * Express 側に SPA fallback を持たせないため、画面遷移は location.hash だけで表す。
 */
export type Route =
  | { view: 'projects' }
  | { view: 'sessions'; projectId: string }
  | { view: 'session'; projectId: string; sessionId: string };

export function parseRoute(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter((p) => p.length > 0);

  if (parts[0] === 'projects' && parts[1]) {
    const projectId = decodeURIComponent(parts[1]);
    if (parts[2] === 'sessions' && parts[3]) {
      return { view: 'session', projectId, sessionId: decodeURIComponent(parts[3]) };
    }
    return { view: 'sessions', projectId };
  }

  return { view: 'projects' };
}

export function routeHash(route: Route): string {
  switch (route.view) {
    case 'projects':
      return '#/';
    case 'sessions':
      return `#/projects/${encodeURIComponent(route.projectId)}`;
    case 'session':
      return `#/projects/${encodeURIComponent(route.projectId)}/sessions/${encodeURIComponent(route.sessionId)}`;
  }
}
