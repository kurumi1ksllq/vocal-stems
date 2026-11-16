// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

/**
 * Ladle 5 走 Vite，所以这里只需要补 Tailwind 和别名。
 * 组件工作台装在这个包里，不污染 app。
 */
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      '@/lib/utils': path.resolve(__dirname, 'src/lib/utils.ts'),
      '@/components/ui': path.resolve(__dirname, 'src/components'),
    },
  },
})
