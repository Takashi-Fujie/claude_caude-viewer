/**
 * SPEC-CONFIG の読み取り層テスト。仕様は docs/design/CONFIG.md。
 *
 * フィクスチャはすべて合成（実ログのパス・プロンプト本文・permissions 実値を書かない）。
 * 壊れた frontmatter・壊れた JSON 行・巨大行を必ず含める。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../server/app.js';
import {
  aggregateHistory,
  listAgentDefinitions,
  listInstalledPlugins,
  listSkillDefinitions,
} from '../../../server/claude-config.js';
import { withTempDir } from '../../helpers/fixtures.js';

/** 合成の ~/.claude 相当ディレクトリを組み立てて fn に渡す。 */
async function withClaudeDir<T>(fn: (claudeDir: string) => Promise<T>): Promise<T> {
  return withTempDir(async (root) => {
    const claudeDir = join(root, 'claude');
    await mkdir(join(claudeDir, 'agents'), { recursive: true });
    await mkdir(join(claudeDir, 'skills', 'sample-skill'), { recursive: true });
    await mkdir(join(claudeDir, 'skills', 'no-manifest'), { recursive: true });
    await mkdir(join(claudeDir, 'plugins'), { recursive: true });

    // 正常系: 引用符付き description（\n エスケープ入り）・カンマ区切り tools
    await writeFile(
      join(claudeDir, 'agents', 'sample-planner.md'),
      '---\nname: sample-planner\ndescription: "設計専門。\\n\\nTRIGGER: 設計時"\ntools: Read, Glob, Grep\nmodel: opus\n---\n本文\n',
    );
    // frontmatter 壊れ（閉じ --- が無い）
    await writeFile(join(claudeDir, 'agents', 'broken.md'), '---\nname: broken\n本文だけで閉じない\n');
    // frontmatter そのものが無い
    await writeFile(join(claudeDir, 'agents', 'plain.md'), '# 見出しだけの定義\n');

    await writeFile(
      join(claudeDir, 'skills', 'sample-skill', 'SKILL.md'),
      '---\nname: sample-skill\ndescription: 合成スキル\n---\n本文\n',
    );

    await writeFile(
      join(claudeDir, 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: {
          'sample-plugin@sample-marketplace': [{ scope: 'user' }],
          'another@official': [{ scope: 'user' }],
        },
      }),
    );

    return fn(claudeDir);
  });
}

describe('エージェント・スキル定義の読み取り', () => {
  it('SPEC-CONFIG-001: agents/*.md の frontmatter から name / description / tools / model を抽出する', async () => {
    await withClaudeDir(async (claudeDir) => {
      const agents = await listAgentDefinitions(claudeDir);
      const planner = agents.find((a) => a.name === 'sample-planner');
      expect(planner).toBeDefined();
      expect(planner?.description).toContain('設計専門。');
      expect(planner?.description).toContain('TRIGGER');
      expect(planner?.tools).toEqual(['Read', 'Glob', 'Grep']);
      expect(planner?.model).toBe('opus');
      expect(planner?.parseError).toBe(false);
    });
  });

  it('SPEC-CONFIG-002: frontmatter が無い・壊れている定義は parseError=true とファイル名由来の name で一覧に残す', async () => {
    await withClaudeDir(async (claudeDir) => {
      const agents = await listAgentDefinitions(claudeDir);
      const names = agents.map((a) => a.name);
      expect(names).toContain('broken');
      expect(names).toContain('plain');
      expect(agents.find((a) => a.name === 'broken')?.parseError).toBe(true);
      expect(agents.find((a) => a.name === 'plain')?.parseError).toBe(true);
    });
  });

  it('SPEC-CONFIG-003: skills/<name>/SKILL.md の frontmatter から description を抽出する', async () => {
    await withClaudeDir(async (claudeDir) => {
      const skills = await listSkillDefinitions(claudeDir);
      const skill = skills.find((s) => s.name === 'sample-skill');
      expect(skill?.description).toBe('合成スキル');
      expect(skill?.parseError).toBe(false);
      // SKILL.md が無いディレクトリはスキルとして数えない
      expect(skills.map((s) => s.name)).not.toContain('no-manifest');
    });
  });
});

describe('プラグイン一覧の読み取り', () => {
  it('SPEC-CONFIG-004: installed_plugins.json のキー name@marketplace を分解してプラグイン一覧を返す', async () => {
    await withClaudeDir(async (claudeDir) => {
      const plugins = await listInstalledPlugins(claudeDir);
      expect(plugins).toEqual([
        { name: 'another', marketplace: 'official' },
        { name: 'sample-plugin', marketplace: 'sample-marketplace' },
      ]);
    });
  });

  it('SPEC-CONFIG-005: installed_plugins.json が無い・壊れている場合は空一覧を返す', async () => {
    await withTempDir(async (root) => {
      expect(await listInstalledPlugins(join(root, 'no-such'))).toEqual([]);

      const claudeDir = join(root, 'claude');
      await mkdir(join(claudeDir, 'plugins'), { recursive: true });
      await writeFile(join(claudeDir, 'plugins', 'installed_plugins.json'), '{ 壊れた json');
      expect(await listInstalledPlugins(claudeDir)).toEqual([]);
    });
  });
});

describe('プロンプト履歴の集計', () => {
  const T1 = Date.UTC(2026, 0, 1, 0, 0, 0); // 2026-01-01T00:00:00.000Z
  const T2 = Date.UTC(2026, 0, 2, 12, 0, 0); // 2026-01-02T12:00:00.000Z

  it('SPEC-CONFIG-010: history.jsonl をストリーム走査し、プロジェクト別の件数と最終利用日時（ISO 8601）を集計する', async () => {
    await withTempDir(async (root) => {
      const claudeDir = join(root, 'claude');
      await mkdir(claudeDir, { recursive: true });
      const lines = [
        JSON.stringify({ display: '依頼文1', project: '/home/dev/project-a', timestamp: T1 }),
        JSON.stringify({ display: '依頼文2', project: '/home/dev/project-a', timestamp: T2 }),
        JSON.stringify({ display: '依頼文3', project: '/home/dev/old-project', timestamp: T1 }),
      ];
      await writeFile(join(claudeDir, 'history.jsonl'), lines.join('\n') + '\n');

      const history = await aggregateHistory(claudeDir);
      expect(history[0]).toEqual({
        project: '/home/dev/project-a',
        count: 2,
        lastTimestamp: '2026-01-02T12:00:00.000Z',
      });
      expect(history[1]).toEqual({
        project: '/home/dev/old-project',
        count: 1,
        lastTimestamp: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  it('SPEC-CONFIG-011: history.jsonl の壊れた行・巨大行はスキップまたは処理して継続する', async () => {
    await withTempDir(async (root) => {
      const claudeDir = join(root, 'claude');
      await mkdir(claudeDir, { recursive: true });
      const huge = JSON.stringify({
        display: '巨大ペースト',
        pastedContents: { text: 'あ'.repeat(60_000) },
        project: '/home/dev/project-a',
        timestamp: T2,
      });
      expect(huge.length).toBeGreaterThan(50_000);
      const lines = [
        JSON.stringify({ display: '依頼文1', project: '/home/dev/project-a', timestamp: T1 }),
        '{ 壊れた json 行',
        huge,
        JSON.stringify({ project: 42, timestamp: 'not-a-number' }), // 型不正も落とさない
      ];
      await writeFile(join(claudeDir, 'history.jsonl'), lines.join('\n') + '\n');

      const history = await aggregateHistory(claudeDir);
      expect(history).toEqual([
        { project: '/home/dev/project-a', count: 2, lastTimestamp: '2026-01-02T12:00:00.000Z' },
      ]);
    });
  });

  it('SPEC-CONFIG-012: history.jsonl が無い場合は空一覧を返す', async () => {
    await withTempDir(async (root) => {
      expect(await aggregateHistory(join(root, 'no-such'))).toEqual([]);
    });
  });

  it('SPEC-CONFIG-013: history のレスポンスにプロンプト本文（display / pastedContents）を含めない', async () => {
    await withTempDir(async (root) => {
      const claudeDir = join(root, 'claude');
      const logDir = join(root, 'projects');
      await mkdir(claudeDir, { recursive: true });
      await mkdir(logDir, { recursive: true });
      await writeFile(
        join(claudeDir, 'history.jsonl'),
        JSON.stringify({
          display: '本文マーカー-DISPLAY',
          pastedContents: { text: '本文マーカー-PASTED' },
          project: '/home/dev/project-a',
          timestamp: Date.UTC(2026, 0, 1),
        }) + '\n',
      );

      const app = createApp({ logDir, cacheDir: join(root, 'cache'), claudeDir });
      const res = await request(app).get('/api/config');
      expect(res.status).toBe(200);
      expect(res.body.history).toEqual([
        expect.objectContaining({ project: '/home/dev/project-a', count: 1 }),
      ]);
      expect(JSON.stringify(res.body)).not.toContain('本文マーカー');
    });
  });
});
