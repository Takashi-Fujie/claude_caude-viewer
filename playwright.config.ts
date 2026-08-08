/**
 * Playwright E2E の設定。仕様は docs/design/FLOW.md（E2E 基盤）。
 *
 * webServer が web/dist をビルドしてから合成フィクスチャ入りのサーバを起動する。
 * ライブ更新テストがフィクスチャへ追記するため、テスト間の順序を固定する
 * （workers: 1・fullyParallel: false。スイートが小さいので直列で十分速い）。
 */
import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL } from './tests/e2e/support/env.js';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:web && tsx tests/e2e/support/server.ts',
    url: `${E2E_BASE_URL}/api/overview`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
