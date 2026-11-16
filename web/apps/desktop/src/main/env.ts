// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
/**
 * 主进程环境变量。用 envtrue 的 createEnv + Zod schema。
 *
 * 打包后没有 .env 文件，全部走默认值；开发时可用 .env 覆盖。
 */
import { createEnv } from 'envtrue'
import { z } from 'zod'

/** 变量全部由主进程直接用，不需要透传给渲染进程。 */
export const env = createEnv({
  server: {
    VS_OUT: z.string().optional(),
    VS_MODELS: z.string().optional(),
    VS_FFMPEG: z.string().optional(),
    VS_FORCE_CPU: z
      .string()
      .optional()
      .transform((v) => v === '1' || v?.toLowerCase() === 'true'),
    VS_REPO_ROOT: z.string().optional(),
    VS_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  },
})

export type MainEnv = typeof env
