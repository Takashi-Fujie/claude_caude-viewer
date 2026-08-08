/**
 * SPEC-DASH の E2E（SPEC-DASH-070〜073）。仕様は docs/design/DASH.md。
 *
 * 合成フィクスチャ（tests/e2e/support/seed.ts）を読み込んだサーバに対する検証。
 * 金額・トークンの厳密値は unit テストが担うので、ここでは実画面に
 * 期待要素が描画される（結線されている）ことを検証する。
 */
import { expect, test } from '@playwright/test';
import { E2E_PROJECT_PATH, SEARCH_TOKEN, SESSION_MAIN } from './support/env.js';

test('SPEC-DASH-070: Overview に総コスト（推定）・総トークン・プロジェクト一覧が合成ログの内容で描画される', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('tile-cost')).toContainText('推定');
  await expect(page.getByTestId('tile-cost')).toContainText('$');
  await expect(page.getByTestId('tile-tokens')).not.toContainText('…');
  await expect(page.getByTestId('project-table')).toContainText(E2E_PROJECT_PATH);
});

test('SPEC-DASH-071: Overview の検索から合成ログ内の語でヒットし、クリックでセッション分析画面へ遷移できる', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: '全文検索' }).fill(SEARCH_TOKEN);
  await page.getByRole('button', { name: '検索' }).click();

  const hits = page.getByTestId('search-hits');
  await expect(hits).toContainText(SESSION_MAIN);
  await hits.getByText(SEARCH_TOKEN).first().click();

  await expect(page).toHaveURL(new RegExp(`#/projects/.+/sessions/${SESSION_MAIN}`));
  await expect(page.locator('.chathead')).toContainText('推定');
});

test('SPEC-DASH-072: Tools & Agents にツール別ランキングが描画される', async ({ page }) => {
  await page.goto('/#/tools');
  await expect(page.getByTestId('tool-ranking')).toContainText('Bash');
});

test('SPEC-DASH-073: 未知モデルを含む合成ログで Overview の警告バナーに件数が表示される', async ({
  page,
}) => {
  await page.goto('/');
  const banner = page.getByTestId('unknown-banner');
  await expect(banner).toContainText('未知モデル 1 件');
  await expect(banner).toContainText('claude-imaginary-9');
  await expect(banner).toContainText('含まれていません');
});
