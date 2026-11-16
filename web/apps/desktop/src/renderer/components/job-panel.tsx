// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { JobHeader } from '@renderer/components/job-header'
import { LogStream } from '@renderer/components/log-stream'
import { StemGrid, StemGridSkeleton } from '@renderer/components/stem-grid'
import type { Job } from '@renderer/lib/api'
import { useJobResult } from '@renderer/lib/use-job-result'
import { useJobStage } from '@renderer/lib/use-job-stage'
import { cn } from '@vs/ui/lib/utils'
import { useEffect, useMemo, useState } from 'react'

/**
 * 任务的详情区：状态在上面，产物在中间，日志收在底部。
 * 「现在发生了什么」全部收在这一个组件里。
 */
export function JobPanel({ job, onCancel }: { job: Job; onCancel?: () => void }) {
  const running = job.status === 'running' || job.status === 'queued'
  const [showLog, setShowLog] = useState(true)
  const { result, loading, error } = useJobResult(job.id, job.status === 'done')

  // 跑完自动把日志收起来，把成品顶上来
  useEffect(() => {
    if (job.status === 'done') setShowLog(false)
    if (job.status === 'failed') setShowLog(true)
  }, [job.status])

  const body = useMemo(() => {
    if (running) return <RunningBody job={job} />
    if (job.status === 'failed') return <FailedBody job={job} />
    if (job.status === 'cancelled') return <Notice>任务已取消，没有产物。</Notice>
    if (job.status === 'interrupted')
      return (
        <Notice tone="warn">上次运行被中断（应用退出或崩溃），没有跑完。重新提交一次就行。</Notice>
      )
    if (loading) return <StemGridSkeleton />
    if (error)
      return (
        <Notice tone="warn">
          {error}
          <br />
          目录不在了就把这条任务删掉，重跑一次。
        </Notice>
      )
    if (!result) return <Notice>这个任务没有产物目录。</Notice>
    return <StemGrid result={result} />
  }, [job, running, loading, error, result])

  return (
    <div className="space-y-4">
      <JobHeader job={job} onCancel={onCancel} />

      <div className="sheet-up">{body}</div>

      {(running || job.status === 'failed') && (
        <div className="space-y-2 border-t border-white/8 pt-3">
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="text-tint text-caption"
          >
            {showLog ? '收起运行日志' : '查看运行日志'}
          </button>
          {showLog && <LogStream jobId={job.id} active={running} />}
        </div>
      )}
    </div>
  )
}

/**
 * 运行中。日志里有真实的阶段标记，所以这四步是真的在动，
 * 不是按耗时猜出来的假进度。
 */
function RunningBody({ job }: { job: Job }) {
  const { stage, stages } = useJobStage(job)

  return (
    <div className="well rounded-[16px] px-4 py-3">
      <div className="flex items-baseline gap-2">
        <Meters />
        <span className="text-footnote font-medium">处理中</span>
        <span className="readout text-muted-foreground ml-auto">{job.elapsed.toFixed(0)} 秒</span>
      </div>

      <ol className="mt-3 space-y-1.5">
        {stages.map((s, i) => {
          const done = stage >= 0 && i < stage
          const now = i === stage
          return (
            <li
              key={s}
              className={cn(
                'flex items-center gap-2.5 text-caption',
                now
                  ? 'text-foreground'
                  : done
                    ? 'text-muted-foreground/80'
                    : 'text-muted-foreground/45',
              )}
            >
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  now ? 'bg-signal' : done ? 'bg-[#30d158]' : 'bg-white/15',
                )}
                aria-hidden
              />
              {s}
            </li>
          )
        })}
      </ol>

      <p className="text-muted-foreground/65 mt-3 text-caption2 leading-relaxed">
        单个模型约 40–90 秒，级联会叠加。可以切到别的页面，任务不会停。
      </p>
    </div>
  )
}

function Meters() {
  return (
    <span className="flex h-3 shrink-0 items-end gap-px" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="bg-signal h-full w-[2px] rounded-full"
          style={{ animation: `meter 1.1s ease-in-out ${i * 0.14}s infinite` }}
        />
      ))}
    </span>
  )
}

function FailedBody({ job }: { job: Job }) {
  return (
    <div className="rounded-[16px] border border-destructive/30 bg-destructive/8 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="bg-destructive size-2 rounded-full" aria-hidden />
        <span className="text-destructive text-footnote font-medium">分离失败</span>
      </div>
      {job.error && (
        <pre className="text-muted-foreground mt-2 overflow-x-auto font-mono text-caption2 leading-relaxed whitespace-pre-wrap">
          {job.error}
        </pre>
      )}
      <p className="text-muted-foreground/70 mt-2 text-caption2 leading-relaxed">
        多数是这三种：权重没放齐、显存不够（把并行降到 1）、ffmpeg 路径失效。
      </p>
    </div>
  )
}

function Notice({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <p
      className={cn(
        'well text-muted-foreground rounded-[16px] px-4 py-3 text-caption',
        tone === 'warn' && 'text-signal',
      )}
    >
      {children}
    </p>
  )
}
