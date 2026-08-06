/**
 * アプリ骨格とハッシュルーティング（SPEC-CHAT-001）。仕様は docs/design/CHAT.md。
 */
import { useEffect, useState } from 'react';
import { parseRoute } from './router';
import { ProjectListView } from './views/ProjectListView';
import { SessionListView } from './views/SessionListView';
import { SessionView } from './views/SessionView';

export function App() {
  const [route, setRoute] = useState(() => parseRoute(location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return (
    <div className="appmain">
      {route.view === 'projects' && (
        <>
          <div className="pagehead">
            <h1>agent-viewer</h1>
            <p>Claude Code ログビューア — コストはすべて pricing.json に基づく推定値。</p>
          </div>
          <ProjectListView />
        </>
      )}
      {route.view === 'sessions' && <SessionListView projectId={route.projectId} />}
      {route.view === 'session' && (
        <SessionView
          key={route.sessionId}
          projectId={route.projectId}
          sessionId={route.sessionId}
        />
      )}
    </div>
  );
}
