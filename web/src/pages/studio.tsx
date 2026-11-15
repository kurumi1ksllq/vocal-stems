import { FolderClock, History } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { EnvPanel } from '@/components/env-panel'
import { JobPanel } from '@/components/job-panel'
import { NewJobPanel } from '@/components/new-job-panel'
import { useToast } from '@/components/toaster'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, type Job } from '@/lib/api'
import { useHealth, useJobs } from '@/lib/hooks'
import { MODE_META, SOURCE_META } from '@/lib/modes'
import { cn, formatRelative } from '@/lib/utils'

/**
 * 分离台主页。
 * 左列是「发起任务」，右列是「当前任务 + 历史」。
 * 任务详情用选中态渲染，而不是每张卡片都展开——省垂直空间。
 */
export function StudioPage() {
  const health = useHealth()
  const { jobs, error: jobsError } = useJobs()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const toast = useToast()

  const active = useMemo(() => {
    const running = jobs.filter((j) => j.status === 'running' || j.status === 'queued')
    const done = jobs.filter((j) => j.status === 'done')
    const rest = jobs.filter((j) => !['running', 'queued', 'done'].includes(j.status))
    return [...running, ...done, ...rest]
  }, [jobs])

  const selected = useMemo(() => {
    if (selectedId) return jobs.find((j) => j.id === selectedId) ?? active[0] ?? null
    return active[0] ?? null
  }, [selectedId, jobs, active])

  const onCreated = useCallback(
    (job: Job) => {
      setSelectedId(job.id)
      toast.push('info', `已加入队列：${MODE_META[job.mode].label}`, job.filename)
    },
    [toast],
  )

  const cancel = useCallback(
    async (id: string) => {
      try {
        await api.cancel(id)
        toast.push('info', '已发送取消信号')
      } catch (e) {
        toast.push('error', '取消失败', e instanceof Error ? e.message : undefined)
      }
    },
    [toast],
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="space-y-4">
        <NewJobPanel onCreated={onCreated} healthOk={health.health?.ok ?? false} />
        <EnvPanel
          health={health.health}
          weights={health.weights}
          error={health.error}
          loading={health.loading}
          onRefresh={health.refresh}
          compact
        />
      </div>

      <div className="space-y-4">
        {selected ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-muted-foreground font-mono text-[11px]">NOW</span>
                {MODE_META[selected.mode].label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <JobPanel job={selected} onCancel={() => void cancel(selected.id)} />
            </CardContent>
          </Card>
        ) : (
          <EmptyState healthOk={health.health?.ok ?? false} />
        )}

        {active.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="text-muted-foreground size-3.5" />
                本会话任务
                <Badge variant="secondary">{active.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {active.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedId(job.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    selected?.id === job.id ? 'bg-secondary/80' : 'hover:bg-secondary/45',
                  )}
                >
                  <span className={cn('size-1.5 shrink-0 rounded-full', statusDot(job.status))} />
                  <span className="truncate text-[12px]">{job.filename}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-[10.5px]">
                    {MODE_META[job.mode].label} · {SOURCE_META[job.source].label}
                  </span>
                  <span className="text-muted-foreground/60 w-16 shrink-0 text-right text-[10px]">
                    {formatRelative(job.created_at)}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {jobsError && <p className="text-destructive text-[11.5px]">{jobsError}</p>}
      </div>
    </div>
  )
}

function statusDot(status: Job['status']) {
  return {
    queued: 'bg-muted-foreground/50',
    running: 'bg-amber-400 animate-pulse',
    done: 'bg-emerald-400',
    failed: 'bg-red-400',
    cancelled: 'bg-muted-foreground/40',
  }[status]
}

function EmptyState({ healthOk }: { healthOk: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
        <div className="bg-secondary/60 text-muted-foreground flex size-10 items-center justify-center rounded-full">
          <FolderClock className="size-4" />
        </div>
        <p className="text-[13px] font-medium">还没有任务</p>
        <p className="text-muted-foreground max-w-[300px] text-[11.5px] leading-relaxed">
          {healthOk
            ? '把音频拖到左边，选好模式就能开始。第一次跑要加载模型，会慢十几秒。'
            : '后端还没连上。先在仓库根目录运行 web\\server\\app.py。'}
        </p>
      </CardContent>
    </Card>
  )
}
