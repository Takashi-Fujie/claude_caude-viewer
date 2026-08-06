/**
 * アプリ骨格・左ナビ・ハッシュルーティング（SPEC-CHAT-001 / SPEC-DASH-030）。
 * 仕様は docs/design/DASH.md。
 */
import { useEffect, useState } from 'react';
import { parseRoute, routeHash } from './router';
import { OverviewView } from './views/OverviewView';
import { ToolsView } from './views/ToolsView';
import { SessionListView } from './views/SessionListView';
import { SessionView } from './views/SessionView';

export function App() {
  const [route, setRoute] = useState(() => parseRoute(location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  // ドリルダウン画面（プロジェクト / セッション）では Overview 側をアクティブ表示にする
  const activeNav = route.view === 'tools' ? 'tools' : 'overview';

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">
          agent-viewer<small>Claude Code ログビューア</small>
        </div>
        <div className="group">ダッシュボード</div>
        <a
          href={routeHash({ view: 'overview' })}
          className={activeNav === 'overview' ? 'active' : ''}
        >
          Overview
        </a>
        <a href={routeHash({ view: 'tools' })} className={activeNav === 'tools' ? 'active' : ''}>
          Tools &amp; Agents
        </a>
        <div className="foot">
          127.0.0.1 のみ
          <br />
          ローカル専用・外部公開なし
        </div>
      </nav>
      <main className="appmain">
        {route.view === 'overview' && <OverviewView />}
        {route.view === 'tools' && <ToolsView />}
        {route.view === 'sessions' && <SessionListView projectId={route.projectId} />}
        {route.view === 'session' && (
          <SessionView
            key={route.sessionId}
            projectId={route.projectId}
            sessionId={route.sessionId}
          />
        )}
      </main>
    </div>
  );
}
