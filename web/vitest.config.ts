import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['{apps,packages}/**/test/**/*.test.ts', '{apps,packages}/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**', '**/release/**'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default'],
    alias: {
      '@vs/shared': path.resolve(here, 'packages/shared/src'),
      '@vs/ui': path.resolve(here, 'packages/ui/src'),
    },
  },
})
