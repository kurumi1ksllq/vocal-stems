// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  // Electron 测试不需要 webServer
})
