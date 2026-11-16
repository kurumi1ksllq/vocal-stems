// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import type { Job } from '@renderer/lib/api'
import { streamLogs } from '@renderer/lib/api'
import { useEffect, useState } from 'react'

/**
 * 从日志里读进度阶段。
 *
 * 脚本不输出百分比，所以「进度条」只能是假的。但日志里有真实的阶段标记
 * （规范化 → 模型推理 → 融合 → 导出 mp3）。与其按耗时瞎猜，不如直接听日志说到了哪一步。
 */
const STAGES = ['规范化', '模型推理', '融合', '导出 mp3'] as const

function detectStage(line: string, current: number): number {
  const t = line.toLowerCase()
  if (/mp3|ffmpeg|导出/.test(t)) return 3
  if (/融合|ensemble|fuse/.test(t)) return 2
  if (/推理|inference|loading|steps?=|\[1\/|\[2\//.test(t)) return 1
  if (/规范|prepare|lufs|resampl/.test(t)) return 0
  return current
}

export function useJobStage(job: Job): { stage: number; stages: readonly string[] } {
  const active = job.status === 'running' || job.status === 'queued'
  // -1 表示「日志还没说到了哪一步」。不能默认成第 0 步，
  // 否则日志还没来就先把「规范化」点亮，等于撒谎。
  const [stage, setStage] = useState(-1)

  useEffect(() => {
    if (!active) return
    setStage(-1)
    return streamLogs(job.id, {
      onLine: (line) => setStage((prev) => detectStage(line, prev)),
    })
  }, [job.id, active])

  return { stage, stages: STAGES }
}
