import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    // E2E（Playwright）は Issue #10 で別ランナーとして追加する
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
    environment: 'node',
    reporters: ['default'],
  },
});
