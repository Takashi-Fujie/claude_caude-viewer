/**
 * Spec ↔ ソースの乖離検査。仕様は docs/spec/SPEC-FLOW.md。
 *
 * 検出するもの:
 *   untested  — Spec に定義があるがテストから参照されていない ID
 *   orphan    — テストから参照されているが Spec に定義が無い ID
 *   duplicate — 2 箇所以上で定義された ID
 *   pending   — `- [ ]` のまま残る受け入れ基準（警告のみ）
 *   apiDrift  — docs/design/SPEC-API.md と server/routes/ で片側にしか無いエンドポイント
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * 参照は「ID の直後にコロン」の形式のみを対象とする（SPEC-FLOW-014）。
 * テストデータとして書かれた ID 文字列を参照と誤検出しないため。
 */
const REFERENCE_ID = /\bSPEC-[A-Z]+-\d{3}(?=:)/g;
const DEFINITION_LINE = /^\s*-\s*\[([ xX])\]\s*`(SPEC-[A-Z]+-\d{3})`\s*(.*)$/;

/** テストデータ用の予約領域（SPEC-FLOW-015）。実仕様には使わない。 */
export const DEFAULT_EXCLUDE_PREFIXES = ['SPEC-SAMPLE-'];
const HTTP_METHOD = /\b(GET|POST|PUT|PATCH|DELETE)\b/;
const API_PATH = /(\/api\/[^\s`|)?,]+)/;
const ROUTE_CALL = /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;

export interface SpecDefinition {
  id: string;
  file: string;
  checked: boolean;
  text: string;
}

export interface SpecSource {
  file: string;
  content: string;
}

export interface AnalyzeInput {
  specs: SpecSource[];
  tests: SpecSource[];
  apiSpecEndpoints: string[];
  routeEndpoints: string[];
  /** 突き合わせから除外する ID の接頭辞。省略時は DEFAULT_EXCLUDE_PREFIXES。 */
  excludePrefixes?: string[];
}

export interface ApiDrift {
  skipped: boolean;
  specOnly: string[];
  routeOnly: string[];
}

export interface Report {
  ok: boolean;
  definitions: SpecDefinition[];
  references: string[];
  untested: string[];
  orphan: string[];
  duplicate: string[];
  pending: SpecDefinition[];
  apiDrift: ApiDrift;
}

/** docs/spec の Markdown からチェックボックス行の定義を抽出する。 */
export function extractDefinitions(file: string, content: string): SpecDefinition[] {
  const definitions: SpecDefinition[] = [];

  for (const line of content.split('\n')) {
    const match = DEFINITION_LINE.exec(line);
    if (!match) continue;

    const [, mark, id, text] = match;
    if (!mark || !id) continue;

    definitions.push({
      id,
      file,
      checked: mark.toLowerCase() === 'x',
      text: (text ?? '').trim(),
    });
  }

  return definitions;
}

/** テストコード中の `SPEC-ID:` 形式から参照を重複なく抽出する。 */
export function extractReferences(content: string): string[] {
  return [...new Set(content.match(REFERENCE_ID) ?? [])];
}

/** docs/design/SPEC-API.md の記述（表・コードブロックとも）から「METHOD /path」を抽出する。 */
export function extractApiEndpoints(markdown: string): string[] {
  const endpoints: string[] = [];

  for (const line of markdown.split('\n')) {
    const method = HTTP_METHOD.exec(line);
    if (!method?.[1]) continue;

    const path = API_PATH.exec(line);
    if (!path?.[1]) continue;

    endpoints.push(`${method[1]} ${path[1]}`);
  }

  return [...new Set(endpoints)];
}

/** ルーター定義から「METHOD /path」を抽出する（/api/ 配下のみ）。 */
export function extractRouteEndpoints(source: string): string[] {
  const endpoints: string[] = [];

  for (const match of source.matchAll(ROUTE_CALL)) {
    const [, method, path] = match;
    if (!method || !path?.startsWith('/api/')) continue;

    endpoints.push(`${method.toUpperCase()} ${path}`);
  }

  return [...new Set(endpoints)];
}

function diffEndpoints(apiSpecEndpoints: string[], routeEndpoints: string[]): ApiDrift {
  if (apiSpecEndpoints.length === 0 && routeEndpoints.length === 0) {
    return { skipped: true, specOnly: [], routeOnly: [] };
  }

  const inSpec = new Set(apiSpecEndpoints);
  const inRoutes = new Set(routeEndpoints);

  return {
    skipped: false,
    specOnly: apiSpecEndpoints.filter((e) => !inRoutes.has(e)),
    routeOnly: routeEndpoints.filter((e) => !inSpec.has(e)),
  };
}

export function analyze(input: AnalyzeInput): Report {
  const excludePrefixes = input.excludePrefixes ?? DEFAULT_EXCLUDE_PREFIXES;
  const isExcluded = (id: string): boolean => excludePrefixes.some((p) => id.startsWith(p));

  const definitions = input.specs
    .flatMap((s) => extractDefinitions(s.file, s.content))
    .filter((d) => !isExcluded(d.id));
  const references = [
    ...new Set(input.tests.flatMap((t) => extractReferences(t.content))),
  ].filter((id) => !isExcluded(id));
  const referenced = new Set(references);

  const occurrences = new Map<string, number>();
  for (const def of definitions) {
    occurrences.set(def.id, (occurrences.get(def.id) ?? 0) + 1);
  }

  const definedIds = [...occurrences.keys()];
  const duplicate = definedIds.filter((id) => (occurrences.get(id) ?? 0) > 1);
  const untested = definedIds.filter((id) => !referenced.has(id));
  const orphan = references.filter((id) => !occurrences.has(id));
  const pending = definitions.filter((def) => !def.checked);
  const apiDrift = diffEndpoints(input.apiSpecEndpoints, input.routeEndpoints);

  const ok =
    untested.length === 0 &&
    orphan.length === 0 &&
    duplicate.length === 0 &&
    apiDrift.specOnly.length === 0 &&
    apiDrift.routeOnly.length === 0;

  return { ok, definitions, references, untested, orphan, duplicate, pending, apiDrift };
}

// ---------------------------------------------------------------- CLI

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function readTree(dir: string, matches: (name: string) => boolean): Promise<SpecSource[]> {
  let entries: string[];
  try {
    entries = await readdir(dir, { recursive: true });
  } catch {
    return [];
  }

  const files = entries.filter(matches);
  return Promise.all(
    files.map(async (name) => {
      const absolute = join(dir, name);
      return { file: relative(ROOT, absolute), content: await readFile(absolute, 'utf8') };
    }),
  );
}

function formatList(label: string, items: string[]): string {
  return `${label}\n${items.map((i) => `    - ${i}`).join('\n')}`;
}

async function main(): Promise<number> {
  // 基本仕様書（docs/spec・人間向け）と詳細設計書（docs/design・AI 向け）の両方を走査する。
  // 規約上チェックボックスは docs/design のみだが、docs/spec に書かれた場合も duplicate 検出で拾う。
  const isSpecFile = (n: string): boolean => n.startsWith('SPEC-') && n.endsWith('.md');
  const specs = [
    ...(await readTree(join(ROOT, 'docs/spec'), isSpecFile)),
    ...(await readTree(join(ROOT, 'docs/design'), isSpecFile)),
  ];
  const tests = await readTree(join(ROOT, 'tests'), (n) => /\.(test|spec)\.tsx?$/.test(n));
  const routes = await readTree(join(ROOT, 'server/routes'), (n) => n.endsWith('.ts'));

  const apiSpec = specs.find((s) => s.file === join('docs/design', 'SPEC-API.md'));
  const report = analyze({
    specs,
    tests,
    apiSpecEndpoints: apiSpec ? extractApiEndpoints(apiSpec.content) : [],
    routeEndpoints: routes.flatMap((r) => extractRouteEndpoints(r.content)),
  });

  const done = report.definitions.length - report.pending.length;
  console.log('Spec 整合チェック');
  console.log(`  Spec ファイル : ${specs.length} 件`);
  console.log(`  受け入れ基準  : ${report.definitions.length} 件（完了 ${done} / 未完了 ${report.pending.length}）`);
  console.log(`  テスト参照    : ${report.references.length} 件`);
  console.log(
    `  API 突き合わせ: ${report.apiDrift.skipped ? 'スキップ（Spec・ルートとも 0 件）' : '実施'}`,
  );
  console.log('');

  if (report.untested.length > 0) {
    console.error(formatList(`✗ 未テスト（Spec にあるがテストが無い）: ${report.untested.length} 件`, report.untested));
  }
  if (report.orphan.length > 0) {
    console.error(formatList(`✗ 孤児テスト（Spec に定義が無い）: ${report.orphan.length} 件`, report.orphan));
  }
  if (report.duplicate.length > 0) {
    console.error(formatList(`✗ ID 重複定義: ${report.duplicate.length} 件`, report.duplicate));
  }
  if (report.apiDrift.specOnly.length > 0) {
    console.error(formatList(`✗ Spec のみに存在するエンドポイント: ${report.apiDrift.specOnly.length} 件`, report.apiDrift.specOnly));
  }
  if (report.apiDrift.routeOnly.length > 0) {
    console.error(formatList(`✗ 実装のみに存在するエンドポイント: ${report.apiDrift.routeOnly.length} 件`, report.apiDrift.routeOnly));
  }
  if (report.pending.length > 0) {
    console.log(
      formatList(
        `△ 未完了の受け入れ基準（警告のみ）: ${report.pending.length} 件`,
        report.pending.map((p) => `${p.id} ${p.text} [${p.file}]`),
      ),
    );
    console.log('');
  }

  if (report.ok) {
    console.log('✓ Spec とソースの乖離はありません');
    return 0;
  }

  console.error('');
  console.error('Spec とソースがずれています。Spec を直すか実装を直すかを判断してください。');
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = await main();
}
