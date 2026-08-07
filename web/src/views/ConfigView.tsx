/**
 * 設定・定義画面（SPEC-CONFIG-030〜033）。仕様は docs/design/CONFIG.md。
 *
 * permissions 実値・プロンプト履歴の集計はここで表示するが、Spec・Issue・PR には
 * 転記しない（public リポジトリのため。証跡は件数などの数値要約のみ）。
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { joinUsage } from '../lib/definitions';
import type { AgentStatsResponse, ConfigResponse } from '../lib/types';

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ja-JP');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** hooks のイベント 1 件から表示用のコマンド文字列を取り出す（形が違っても落とさない）。 */
function hookCommands(entries: unknown): string[] {
  if (!Array.isArray(entries)) return [];
  const commands: string[] = [];
  for (const entry of entries) {
    const inner = asRecord(entry)?.['hooks'];
    if (!Array.isArray(inner)) continue;
    for (const hook of inner) {
      const command = asRecord(hook)?.['command'];
      if (typeof command === 'string') commands.push(command);
    }
  }
  return commands;
}

const PERMISSION_KINDS = ['allow', 'deny', 'ask'] as const;

export function ConfigView() {
  const [config, setConfig] = useState<ConfigResponse | undefined>();
  const [stats, setStats] = useState<AgentStatsResponse | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let alive = true;
    Promise.all([api.config(), api.statsAgents({})]).then(
      ([c, s]) => {
        if (!alive) return;
        setConfig(c);
        setStats(s);
      },
      (e: Error) => {
        if (alive) setError(e.message);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const agents = useMemo(() => {
    const usage = new Map(
      joinUsage(config?.agents ?? [], stats?.subagents ?? []).map((j) => [j.name, j]),
    );
    return (config?.agents ?? []).map((def) => ({ def, usage: usage.get(def.name) }));
  }, [config, stats]);

  const skills = useMemo(() => {
    const usage = new Map(
      joinUsage(config?.skills ?? [], stats?.skills ?? []).map((j) => [j.name, j]),
    );
    return (config?.skills ?? []).map((def) => ({ def, usage: usage.get(def.name) }));
  }, [config, stats]);

  const settings = asRecord(config?.settings);
  const permissions = asRecord(settings?.['permissions']);
  const hooks = asRecord(settings?.['hooks']);
  const enabledPlugins = asRecord(settings?.['enabledPlugins']);
  const statusLineCommand = asRecord(settings?.['statusLine'])?.['command'];

  return (
    <>
      <div className="pagehead">
        <h1>設定・定義</h1>
        <p>
          {config?.claudeDir ?? '~/.claude'} の定義と起動実績の突き合わせ。未使用 =
          全期間で起動 0 件。
        </p>
      </div>
      <div className="dashwrap">
        {error !== undefined && <div className="note err">読み込みに失敗しました: {error}</div>}

        <div className="sectionlabel">エージェント / スキル</div>
        <div className="card">
          <h2>
            エージェント定義<span className="est">全期間の起動実績付き</span>
          </h2>
          <table data-testid="config-agent-table">
            <thead>
              <tr>
                <th>エージェント</th>
                <th>説明</th>
                <th>モデル</th>
                <th>ツール</th>
                <th className="num">起動</th>
                <th>最終起動</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(({ def, usage }) => (
                <tr key={def.path}>
                  <td className="mono">{def.name}</td>
                  <td>{def.description === null ? '—' : def.description.slice(0, 80)}</td>
                  <td className="mono">{def.model ?? '—'}</td>
                  <td className="mono">{def.tools === null ? '全ツール' : def.tools.join(', ')}</td>
                  <td className="num">{usage?.count ?? 0}</td>
                  <td>{formatWhen(usage?.lastTimestamp ?? null)}</td>
                  <td>
                    {usage?.unused === true && <span className="badge unused">未使用</span>}{' '}
                    {def.parseError && <span className="badge unused">パース不能</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>
            スキル定義<span className="est">全期間の起動実績付き</span>
          </h2>
          <table data-testid="config-skill-table">
            <thead>
              <tr>
                <th>スキル</th>
                <th>説明</th>
                <th className="num">起動</th>
                <th>最終起動</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {skills.map(({ def, usage }) => (
                <tr key={def.path}>
                  <td className="mono">{def.name}</td>
                  <td>{def.description === null ? '—' : def.description.slice(0, 80)}</td>
                  <td className="num">{usage?.count ?? 0}</td>
                  <td>{formatWhen(usage?.lastTimestamp ?? null)}</td>
                  <td>
                    {usage?.unused === true && <span className="badge unused">未使用</span>}{' '}
                    {def.parseError && <span className="badge unused">パース不能</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="note">
            プラグイン由来スキル（plugin:skill 形式）とビルトインは定義一覧に出ない（Tools &amp;
            Agents の実績側で確認できる）
          </div>
        </div>

        <div className="sectionlabel">プラグイン / settings</div>
        <div className="cols2">
          <div className="card">
            <h2>
              インストール済みプラグイン<span className="est">installed_plugins.json</span>
            </h2>
            <table data-testid="config-plugin-table">
              <thead>
                <tr>
                  <th>プラグイン</th>
                  <th>マーケットプレイス</th>
                </tr>
              </thead>
              <tbody>
                {(config?.plugins ?? []).map((p) => (
                  <tr key={`${p.name}@${p.marketplace}`}>
                    <td className="mono">{p.name}</td>
                    <td className="mono">{p.marketplace}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" data-testid="config-settings">
            <h2>
              settings.json<span className="est">画面のみ・転記しない</span>
            </h2>
            {settings === null ? (
              <div className="note">settings.json が無いか読めません</div>
            ) : (
              <>
                <h3>permissions</h3>
                {PERMISSION_KINDS.map((kind) => (
                  <div key={kind}>
                    <div className="pmeta">{kind}</div>
                    <ul>
                      {asStringArray(permissions?.[kind]).map((rule) => (
                        <li className="mono" key={rule}>
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <h3>hooks</h3>
                <ul>
                  {Object.entries(hooks ?? {}).map(([event, entries]) => (
                    <li key={event}>
                      <span className="mono">{event}</span>
                      <ul>
                        {hookCommands(entries).map((command, i) => (
                          <li className="mono" key={`${event}-${i}`}>
                            {command}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                <h3>enabledPlugins</h3>
                <ul>
                  {Object.entries(enabledPlugins ?? {}).map(([name, enabled]) => (
                    <li className="mono" key={name}>
                      {name}
                      {enabled === true ? '' : '（無効）'}
                    </li>
                  ))}
                </ul>
                <h3>statusLine</h3>
                <div className="mono">
                  {typeof statusLineCommand === 'string' ? statusLineCommand : '—'}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="sectionlabel">プロンプト履歴</div>
        <div className="card">
          <h2>
            プロジェクト別プロンプト数<span className="est">history.jsonl・projects/ に無いものも含む</span>
          </h2>
          <table data-testid="config-history-table">
            <thead>
              <tr>
                <th>プロジェクト</th>
                <th className="num">プロンプト数</th>
                <th>最終利用</th>
              </tr>
            </thead>
            <tbody>
              {(config?.history ?? []).map((h) => (
                <tr key={h.project}>
                  <td className="mono">{h.project}</td>
                  <td className="num">{h.count}</td>
                  <td>{formatWhen(h.lastTimestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
