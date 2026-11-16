import { JobHeader } from '@renderer/components/job-header'
import { LogStream } from '@renderer/components/log-stream'
import { StemGrid, StemGridSkeleton } from '@renderer/components/stem-grid'
import type { Job } from '@renderer/lib/api'
import { useJobResult } from '@renderer/lib/use-job-result'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

/**
 * 任务进行中 / 完成后的详情。
 * 页面的「现在发生了什么」全部收在这一个组件里。
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
    if (job.status === 'cancelled') return <CancelledBody />
    if (loading) return <StemGridSkeleton />
    if (error)
      return (
        <div className="text-muted-foreground flex items-center gap-2 py-6 text-[12.5px]">
          <AlertCircle className="size-3.5" />
          {error}
        </div>
      )
    if (!result) return <p className="text-muted-foreground py-6 text-[12.5px]">没有找到产物目录</p>
    return <StemGrid result={result} />
  }, [job, running, loading, error, result])

  return (
    <div className="space-y-3">
      <JobHeader job={job} onCancel={onCancel} />

      {body}

      {(running || job.status === 'failed') && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="text-muted-foreground hover:text-foreground text-[11.5px] transition-colors"
          >
            {showLog ? '收起日志' : '查看日志'}
          </button>
          {showLog && <LogStream jobId={job.id} active={running} />}
        </div>
      )}
    </div>
  )
}

function RunningBody({ job }: { job: Job }) {
  const steps = ['规范化', '模型推理', '融合', '导出 mp3']
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Loader2 className="text-primary size-4 animate-spin" />
        <span className="text-[13px] font-medium">处理中</span>
        <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
          {job.elapsed.toFixed(0)}s
        </span>
      </div>
      <div className="space-y-1.5">
        {steps.map((s, i) => (
          <div key={s} className="text-muted-foreground flex items-center gap-2 text-[11.5px]">
            <span className="bg-secondary size-1 rounded-full" />
            <span className={i === 0 ? 'text-foreground/80' : ''}>{s}</span>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground/60 mt-3 text-[10.5px]">
        单个模型约 40–90 秒，级联会叠加。别关这个页面，任务在后端继续跑。
      </p>
    </div>
  )
}

function FailedBody({ job }: { job: Job }) {
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <AlertCircle className="text-destructive size-4" />
        <span className="text-destructive text-[13px] font-medium">分离失败</span>
      </div>
      {job.error && (
        <pre className="text-muted-foreground overflow-x-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {job.error}
        </pre>
      )}
      <p className="text-muted-foreground/70 mt-2 text-[10.5px]">
        常见原因：权重缺失、显存不足（把并行降到 1）、ffmpeg 路径失效。
      </p>
    </div>
  )
}

function CancelledBody() {
  return (
    <div className="text-muted-foreground rounded-xl border border-border/60 bg-card/30 p-4 text-[12.5px]">
      任务已取消。
    </div>
  )
}
