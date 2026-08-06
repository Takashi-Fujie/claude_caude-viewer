/**
 * 簡易プロジェクト一覧（SPEC-CHAT-001 の入口。#7 で本実装の Overview に置き換える）。
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatTokens, formatUsd } from '../lib/format';
import { routeHash } from '../router';
import type { ProjectListItem } from '../lib/types';

/** 実パスの末尾ディレクトリ名（表示上の短い名前）。 */
function basename(path: string | null): string | undefined {
  if (!path) return undefined;
  return path.split('/').filter((p) => p.length > 0).at(-1);
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ja-JP');
}

export function ProjectListView() {
  const [projects, setProjects] = useState<ProjectListItem[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  // セッション 0 のプロジェクト（memory/ だけのディレクトリ等）は既定で隠す（SPEC-CHAT-005）
  const [showEmpty, setShowEmpty] = useState(false);

  useEffect(() => {
    let alive = true;
    api.projects().then(
      (list) => {
        if (alive) setProjects([...list].sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? '')));
      },
      (e: Error) => {
        if (alive) setError(e.message);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="dashwrap">
      <div className="card">
        <h2>
          プロジェクト<span className="est">簡易表示・クリックでセッション一覧へ（本実装は #7）</span>
        </h2>
        <label className="note" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={(e) => setShowEmpty(e.target.checked)}
          />
          セッション 0 件のプロジェクトも表示（永続メモリのみのディレクトリ等）
        </label>
        {error !== undefined && <div className="note err">読み込みに失敗しました: {error}</div>}
        {projects === undefined && error === undefined && <div className="note">読み込み中…</div>}
        {projects !== undefined && (
          <table>
            <thead>
              <tr>
                <th style={{ width: '46%' }}>プロジェクト</th>
                <th className="num">セッション</th>
                <th className="num">トークン</th>
                <th className="num">コスト推定</th>
                <th>最終更新</th>
              </tr>
            </thead>
            <tbody>
              {projects.filter((p) => showEmpty || p.sessionCount > 0).map((p) => (
                <tr
                  key={p.id}
                  className="rowlink"
                  onClick={() => {
                    location.hash = routeHash({ view: 'sessions', projectId: p.id });
                  }}
                >
                  <td>
                    <b>{basename(p.path) ?? p.id}</b>
                    {p.path !== null && <span className="pmeta mono">{p.path}</span>}
                  </td>
                  <td className="num">{p.sessionCount}</td>
                  <td className="num">{formatTokens(p.totalTokens)}</td>
                  <td className="num">
                    <b>{formatUsd(p.estimatedCost)}</b>
                  </td>
                  <td>{formatWhen(p.lastTimestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
