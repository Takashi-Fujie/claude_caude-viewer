/**
 * SPEC-CONFIG の E2E（SPEC-CONFIG-040〜042）。仕様は docs/design/CONFIG.md。
 *
 * 合成 claudeDir（tests/e2e/support/seed.ts）に対する検証。実 ~/.claude には触れない。
 */
import { expect, test } from '@playwright/test';

test('SPEC-CONFIG-040: 設定・定義画面にエージェント・スキル・プラグインの一覧が合成 claudeDir の内容で描画される', async ({
  page,
}) => {
  await page.goto('/#/config');
  await expect(page.getByTestId('config-agent-table')).toContainText('sample-unused-agent');
  await expect(page.getByTestId('config-skill-table')).toContainText('sample-skill');
  await expect(page.getByTestId('config-plugin-table')).toContainText('sample-plugin');
});

test('SPEC-CONFIG-041: frontmatter が壊れた定義が「パース不能」として一覧に残り、画面全体は描画される', async ({
  page,
}) => {
  await page.goto('/#/config');
  const agents = page.getByTestId('config-agent-table');
  const brokenRow = agents.locator('tr', { hasText: 'sample-broken-agent' });
  await expect(brokenRow).toContainText('パース不能');
  // 壊れた定義があっても他のテーブルは描画される
  await expect(page.getByTestId('config-skill-table')).toBeVisible();
});

test('SPEC-CONFIG-042: 起動実績 0 件の定義に未使用バッジが表示される', async ({ page }) => {
  await page.goto('/#/config');
  const row = page
    .getByTestId('config-agent-table')
    .locator('tr', { hasText: 'sample-unused-agent' });
  await expect(row).toContainText('未使用');
});
