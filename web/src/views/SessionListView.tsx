/**
 * 簡易セッション一覧（SPEC-CHAT-001 の入口。#7 で本実装のプロジェクト画面に置き換える）。
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ProjectDetail } from '../api';
import { formatTokens, formatUsd } from '../lib/format';
import { routeHash } from '../router';

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ja-JP');
}

export function SessionListView({ projectId }: { projectId: string }) {
  const [detail, setDetail] = useState<ProjectDetail | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let alive = true;
    api.project(projectId).then(
      (d) => {
        if (alive) setDetail(d);
      },
      (e: Error) => {
        if (alive) setError(e.message);
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  const sessions = detail
    ? [...detail.sessions].sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''))
    : undefined;

  return (
    <>
      <div className="crumbs">
        <a href={routeHash({ view: 'projects' })}>← Overview</a>
        <span className="sep">/</span>
        <span className="mono">{detail?.path ?? projectId}</span>
      </div>
      <div className="dashwrap">
        <div className="card">
          <h2>
            セッション<span className="est">簡易表示・クリックで会話分析へ（本実装は #7）</span>
          </h2>
          {error !== undefined && <div className="note err">読み込みに失敗しました: {error}</div>}
          {sessions === undefined && error === undefined && <div className="note">読み込み中…</div>}
          {sessions !== undefined && (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>セッション</th>
                  <th>モデル</th>
                  <th className="num">msg</th>
                  <th className="num">トークン</th>
                  <th className="num">コスト推定</th>
                  <th>最終更新</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    className="rowlink"
                    onClick={() => {
                      location.hash = routeHash({ view: 'session', projectId, sessionId: s.id });
                    }}
                  >
                    <td>
                      <b>{s.title ?? s.id}</b>
                    </td>
                    <td className="mono">{s.models.join(', ')}</td>
                    <td className="num">{s.recordCount.toLocaleString()}</td>
                    <td className="num">{formatTokens(s.totalTokens)}</td>
                    <td className="num">{formatUsd(s.estimatedCost)}</td>
                    <td>{formatWhen(s.lastTimestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
