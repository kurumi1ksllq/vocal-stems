import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StoryDefault } from '@ladle/react'

const here = path.dirname(fileURLToPath(import.meta.url))

/** 所有 story 共享的外壳：暗色 + 一点留白。 */
export default {
  stories: 'src/**/*.stories.{ts,tsx}',
  addons: {
    theme: {
      defaultState: 'dark',
    },
  },
  viteConfig: path.resolve(here, 'vite.config.ts'),
} satisfies StoryDefault
