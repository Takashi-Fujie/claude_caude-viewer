/**
 * 型付き fetch クライアント。仕様は docs/design/CHAT.md。
 * DTO はサーバの正規化型（lib/types.ts 経由）だけを参照する。
 */
import type { MessagesPage, ProjectListItem, SessionDetail, SessionListItem } from './lib/types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // JSON でないエラー応答はステータスのまま
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface ProjectDetail {
  id: string;
  path: string | null;
  sessions: SessionListItem[];
}

export const api = {
  projects: () => getJson<ProjectListItem[]>('/api/projects'),
  project: (id: string) => getJson<ProjectDetail>(`/api/projects/${encodeURIComponent(id)}`),
  session: (id: string) => getJson<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),
  messages: (id: string, start: number, limit: number) =>
    getJson<MessagesPage>(
      `/api/sessions/${encodeURIComponent(id)}/messages?start=${start}&limit=${limit}`,
    ),
};
