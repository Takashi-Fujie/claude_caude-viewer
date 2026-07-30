/**
 * spec-check 自身のテスト。
 *
 * テストデータ中の ID は必ず `SPEC-SAMPLE-` を使う（SPEC-FLOW-015 の予約領域）。
 * 実ファイル走査時に arbitrary な ID を孤児テストと誤検出させないため。
 * 除外そのものを検証するテストだけは excludePrefixes: [] を明示して無効化する。
 */
import { describe, it, expect } from 'vitest';
import {
  analyze,
  extractDefinitions,
  extractReferences,
  extractApiEndpoints,
  extractRouteEndpoints,
  DEFAULT_EXCLUDE_PREFIXES,
} from '../../scripts/spec-check.js';

/** テストデータ由来の ID を除外せずそのまま突き合わせるための共通入力。 */
const noExclusion = { excludePrefixes: [] as string[] };
const emptyApi = { apiSpecEndpoints: [] as string[], routeEndpoints: [] as string[] };

describe('extractDefinitions', () => {
  it('SPEC-FLOW-001: チェックボックス行から SPEC-ID を定義として抽出する', () => {
    const md = [
      '# タイトル',
      '',
      '- [ ] `SPEC-SAMPLE-001` 未実装の基準',
      '- [x] `SPEC-SAMPLE-002` 実装済みの基準',
    ].join('\n');

    const defs = extractDefinitions('SPEC-SAMPLE.md', md);

    expect(defs).toEqual([
      { id: 'SPEC-SAMPLE-001', file: 'SPEC-SAMPLE.md', checked: false, text: '未実装の基準' },
      { id: 'SPEC-SAMPLE-002', file: 'SPEC-SAMPLE.md', checked: true, text: '実装済みの基準' },
    ]);
  });

  it('SPEC-FLOW-002: チェックボックス行以外の ID 言及は定義として扱わない', () => {
    const md = [
      '本文で SPEC-SAMPLE-900 に言及しても定義ではない。',
      '| SPEC-SAMPLE-901 | 表の中の言及 |',
      '`SPEC-SAMPLE-902` のようなインラインコードも定義ではない。',
      '- 箇条書きだがチェックボックスが無い `SPEC-SAMPLE-903`',
      '',
      '- [ ] `SPEC-SAMPLE-001` これだけが定義',
    ].join('\n');

    expect(extractDefinitions('SPEC-SAMPLE.md', md).map((d) => d.id)).toEqual(['SPEC-SAMPLE-001']);
  });
});

describe('extractReferences', () => {
  it('SPEC-FLOW-003: テスト名の `SPEC-ID:` 形式から参照を抽出する', () => {
    const src = [
      "it('SPEC-SAMPLE-003: 1h キャッシュ書き込みを x2.0 で計算する', () => {});",
      "describe('SPEC-SAMPLE-004: グループ', () => {",
      "  it('SPEC-SAMPLE-003: 重複参照でも 1 件に畳む', () => {});",
      '});',
    ].join('\n');

    expect(extractReferences(src)).toEqual(['SPEC-SAMPLE-003', 'SPEC-SAMPLE-004']);
  });

  it('SPEC-FLOW-014: 直後にコロンが続かない ID は参照として扱わない', () => {
    const src = [
      "const md = '- [ ] `SPEC-SAMPLE-100` テストデータ内の定義行';",
      "it('SPEC-SAMPLE-101 コロンが無いテスト名', () => {});",
      'expect(report.orphan).toEqual([\'SPEC-SAMPLE-102\']);',
      "it('SPEC-SAMPLE-103: これだけが参照', () => {});",
    ].join('\n');

    expect(extractReferences(src)).toEqual(['SPEC-SAMPLE-103']);
  });
});

describe('analyze', () => {
  it('SPEC-FLOW-004: 定義があり参照がない ID を untested として報告する', () => {
    const report = analyze({
      specs: [{ file: 'S.md', content: '- [ ] `SPEC-SAMPLE-001` 未テストの基準' }],
      tests: [],
      ...emptyApi,
      ...noExclusion,
    });

    expect(report.untested).toEqual(['SPEC-SAMPLE-001']);
  });

  it('SPEC-FLOW-005: 参照があり定義がない ID を orphan として報告する', () => {
    const report = analyze({
      specs: [{ file: 'S.md', content: '- [x] `SPEC-SAMPLE-001` 定義済み' }],
      tests: [
        {
          file: 'a.test.ts',
          content: [
            "it('SPEC-SAMPLE-001: 定義あり', () => {});",
            "it('SPEC-SAMPLE-777: 消えた仕様', () => {});",
          ].join('\n'),
        },
      ],
      ...emptyApi,
      ...noExclusion,
    });

    expect(report.orphan).toEqual(['SPEC-SAMPLE-777']);
  });

  it('SPEC-FLOW-006: 2 箇所以上で定義された ID を duplicate として報告する', () => {
    const report = analyze({
      specs: [
        { file: 'A.md', content: '- [ ] `SPEC-SAMPLE-001` こちらで定義' },
        { file: 'B.md', content: '- [ ] `SPEC-SAMPLE-001` 誤ってこちらでも定義' },
      ],
      tests: [{ file: 'a.test.ts', content: "it('SPEC-SAMPLE-001: t', () => {});" }],
      ...emptyApi,
      ...noExclusion,
    });

    expect(report.duplicate).toEqual(['SPEC-SAMPLE-001']);
  });

  it('SPEC-FLOW-007: 未チェックの受け入れ基準を pending として報告する', () => {
    const report = analyze({
      specs: [
        {
          file: 'S.md',
          content: ['- [ ] `SPEC-SAMPLE-001` 未完了', '- [x] `SPEC-SAMPLE-002` 完了'].join('\n'),
        },
      ],
      tests: [
        {
          file: 'a.test.ts',
          content: "it('SPEC-SAMPLE-001: a', () => {}); it('SPEC-SAMPLE-002: b', () => {});",
        },
      ],
      ...emptyApi,
      ...noExclusion,
    });

    expect(report.pending.map((p) => p.id)).toEqual(['SPEC-SAMPLE-001']);
  });

  it('SPEC-FLOW-008: untested / orphan / duplicate があれば ok=false を返す', () => {
    const untestedOnly = analyze({
      specs: [{ file: 'S.md', content: '- [ ] `SPEC-SAMPLE-001` x' }],
      tests: [],
      ...emptyApi,
      ...noExclusion,
    });
    const orphanOnly = analyze({
      specs: [],
      tests: [{ file: 'a.test.ts', content: "it('SPEC-SAMPLE-777: x', () => {});" }],
      ...emptyApi,
      ...noExclusion,
    });
    const duplicateOnly = analyze({
      specs: [
        { file: 'A.md', content: '- [ ] `SPEC-SAMPLE-001` x' },
        { file: 'B.md', content: '- [ ] `SPEC-SAMPLE-001` x' },
      ],
      tests: [{ file: 'a.test.ts', content: "it('SPEC-SAMPLE-001: x', () => {});" }],
      ...emptyApi,
      ...noExclusion,
    });

    expect(untestedOnly.ok).toBe(false);
    expect(orphanOnly.ok).toBe(false);
    expect(duplicateOnly.ok).toBe(false);
  });

  it('SPEC-FLOW-009: pending だけが残る状態では ok=true を返す', () => {
    const report = analyze({
      specs: [{ file: 'S.md', content: '- [ ] `SPEC-SAMPLE-001` 未完了だがテストはある' }],
      tests: [{ file: 'a.test.ts', content: "it('SPEC-SAMPLE-001: red 中', () => {});" }],
      ...emptyApi,
      ...noExclusion,
    });

    expect(report.pending.map((p) => p.id)).toEqual(['SPEC-SAMPLE-001']);
    expect(report.untested).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('SPEC-FLOW-013: チェック済み `- [x]` でも参照が無ければ untested として報告する', () => {
    const report = analyze({
      specs: [{ file: 'S.md', content: '- [x] `SPEC-SAMPLE-002` 完了扱いだがテストが無い' }],
      tests: [],
      ...emptyApi,
      ...noExclusion,
    });

    expect(report.untested).toEqual(['SPEC-SAMPLE-002']);
    expect(report.pending).toEqual([]);
    expect(report.ok).toBe(false);
  });

  // 対比用の「除外されない ID」も予約領域（SPEC-SAMPLE-）内に収める必要がある。
  // 領域外の ID をここに書くと、実ファイル走査で本物の孤児テストとして検出されてしまう。
  it('SPEC-FLOW-015: 指定した接頭辞の ID を定義・参照の両方から除外する', () => {
    const report = analyze({
      specs: [
        {
          file: 'S.md',
          content: [
            '- [ ] `SPEC-SAMPLE-901` 除外される定義',
            '- [ ] `SPEC-SAMPLE-001` 残る定義',
          ].join('\n'),
        },
      ],
      tests: [
        {
          file: 'a.test.ts',
          content: [
            "it('SPEC-SAMPLE-902: 除外される参照', () => {});",
            "it('SPEC-SAMPLE-001: 残る参照', () => {});",
          ].join('\n'),
        },
      ],
      ...emptyApi,
      excludePrefixes: ['SPEC-SAMPLE-9'],
    });

    expect(report.definitions.map((d) => d.id)).toEqual(['SPEC-SAMPLE-001']);
    expect(report.references).toEqual(['SPEC-SAMPLE-001']);
    expect(report.untested).toEqual([]);
    expect(report.orphan).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('SPEC-FLOW-015: 既定の除外接頭辞は SPEC-SAMPLE- である', () => {
    const report = analyze({
      specs: [{ file: 'S.md', content: '- [ ] `SPEC-SAMPLE-001` テストデータ用の定義' }],
      tests: [{ file: 'a.test.ts', content: "it('SPEC-SAMPLE-002: テストデータ用の参照', () => {});" }],
      ...emptyApi,
    });

    expect(DEFAULT_EXCLUDE_PREFIXES).toEqual(['SPEC-SAMPLE-']);
    expect(report.definitions).toEqual([]);
    expect(report.references).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe('API エンドポイントの突き合わせ', () => {
  it('SPEC-FLOW-010: Spec とルートで片側のみのエンドポイントを apiDrift として報告する', () => {
    const report = analyze({
      specs: [],
      tests: [],
      apiSpecEndpoints: ['GET /api/overview', 'GET /api/projects'],
      routeEndpoints: ['GET /api/overview', 'POST /api/reindex'],
      ...noExclusion,
    });

    expect(report.apiDrift.specOnly).toEqual(['GET /api/projects']);
    expect(report.apiDrift.routeOnly).toEqual(['POST /api/reindex']);
    expect(report.apiDrift.skipped).toBe(false);
  });

  it('SPEC-FLOW-011: Spec とルートがともに 0 件なら apiDrift 検査をスキップする', () => {
    const report = analyze({ specs: [], tests: [], ...emptyApi, ...noExclusion });

    expect(report.apiDrift.skipped).toBe(true);
    expect(report.apiDrift.specOnly).toEqual([]);
    expect(report.apiDrift.routeOnly).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('SPEC-FLOW-012: apiDrift があれば ok=false を返す', () => {
    const report = analyze({
      specs: [],
      tests: [],
      apiSpecEndpoints: ['GET /api/overview'],
      routeEndpoints: [],
      ...noExclusion,
    });

    expect(report.ok).toBe(false);
  });

  it('SPEC-FLOW-010: SPEC-API.md の記述からメソッドとパスを抽出する', () => {
    const md = [
      '| メソッド | パス | 説明 |',
      '|---|---|---|',
      '| `GET` | `/api/overview` | 全体サマリ |',
      '',
      '```',
      'GET  /api/sessions?project=   セッション一覧',
      'POST /api/reindex             再インデックス',
      'WS   /ws                      増分イベント',
      '```',
    ].join('\n');

    expect(extractApiEndpoints(md)).toEqual([
      'GET /api/overview',
      'GET /api/sessions',
      'POST /api/reindex',
    ]);
  });

  it('SPEC-FLOW-010: ルーター定義からメソッドとパスを抽出する', () => {
    const src = [
      "router.get('/api/overview', handler);",
      'app.post("/api/reindex", handler);',
      'router.get(`/api/sessions/:id/messages`, handler);',
      "someOther.get('/not-api', handler);",
    ].join('\n');

    expect(extractRouteEndpoints(src)).toEqual([
      'GET /api/overview',
      'POST /api/reindex',
      'GET /api/sessions/:id/messages',
    ]);
  });
});
