// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { EnvPanel } from '@renderer/components/env-panel'
import { JobPanel } from '@renderer/components/job-panel'
import { NewJobPanel } from '@renderer/components/new-job-panel'
import { useToast } from '@renderer/components/toaster'
import { api, type Job } from '@renderer/lib/api'
import { useHealth, useJobs, useLibrary } from '@renderer/lib/hooks'
import { MODE_META, SOURCE_META } from '@renderer/lib/modes'
import { cn, formatBytes, formatRelative } from '@vs/ui/lib/utils'
import { useCallback, useMemo, useState } from 'react'

/**
 * 分离台。
 *
 * iOS 的首页结构是「大标题 + 若干 grouping，每组一个 label 一块玻璃」。
 * 左列：新建分离（一块玻璃）+ 环境（一块玻璃）
 * 右列：当前任务 / 最近产物 + 本会话
 *
 * 大标题是这一页唯一的"响亮"元素，其余全部安静。
 */
export function StudioPage() {
  const health = useHealth()
  const { jobs, error: jobsError } = useJobs()
  const library = useLibrary()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const toast = useToast()

  const sorted = useMemo(() => {
    const running = jobs.filter((j) => j.status === 'running' || j.status === 'queued')
    const done = jobs.filter((j) => j.status === 'done')
    const rest = jobs.filter((j) => !['running', 'queued', 'done'].includes(j.status))
    return [...running, ...done, ...rest]
  }, [jobs])

  const selected = useMemo(() => {
    if (selectedId) return jobs.find((j) => j.id === selectedId) ?? null
    return sorted[0] ?? null
  }, [selectedId, jobs, sorted])

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
        toast.push('error', '取消没成功', e instanceof Error ? e.message : undefined)
      }
    },
    [toast],
  )

  return (
    <div className="window-in">
      {/* 大标题区：iOS 的大标题会随滚动收起，这里固定在内容顶部 */}
      <div className="mb-6 px-1">
        <h1 className="text-title1">分离台</h1>
        <p className="text-muted-foreground mt-1.5 max-w-[52ch] text-footnote leading-relaxed">
          整曲进来，一路拆到干声。全部在本机 GPU 上跑。
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="space-y-5">
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

        <div className="min-w-0 space-y-5">
          {selected ? (
            <section className="sheet-up">
              <GroupLabel>
                <span>当前任务</span>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-tint ml-auto font-normal"
                >
                  收起到列表
                </button>
              </GroupLabel>
              <div className="glass border-white/10 rounded-[24px] border px-5 py-4">
                <JobPanel job={selected} onCancel={() => void cancel(selected.id)} />
              </div>
            </section>
          ) : (
            <RecentOutputs
              entries={library.entries}
              loading={library.loading}
              error={library.error}
              onRefresh={() => void library.refresh()}
              healthOk={health.health?.ok ?? false}
            />
          )}

          {sorted.length > 0 && (
            <section>
              <GroupLabel>
                <span>本会话</span>
                <span className="readout ml-auto font-normal">{sorted.length} 个任务</span>
              </GroupLabel>
              <div className="glass border-white/10 overflow-hidden rounded-[18px] border">
                {sorted.map((job, i) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    selected={selected?.id === job.id}
                    first={i === 0}
                    onSelect={() => setSelectedId(job.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {jobsError && <p className="text-destructive px-1 text-caption">{jobsError}</p>}
        </div>
      </div>
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="group-label mb-2 flex items-baseline gap-2 px-4">{children}</div>
}

/**
 * 没有选中任务时显示已有产物。
 *
 * 比空态好用：这些是磁盘上真实存在的目录，而不是一段"以后会有东西"的说明。
 * 用 iOS 的分组列表呈现——每行一个目录，右侧是读数。
 */
function RecentOutputs({
  entries,
  loading,
  error,
  onRefresh,
  healthOk,
}: {
  entries: { name: string; dir: string; mtime: number; count: number; size: number }[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  healthOk: boolean
}) {
  return (
    <section>
      <GroupLabel>
        <span>最近产物</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-tint ml-auto font-normal"
        >
          {loading ? '扫描中…' : '重新扫描'}
        </button>
      </GroupLabel>

      <div className="glass border-white/10 overflow-hidden rounded-[18px] border">
        {error && <p className="text-destructive px-4 py-3 text-caption">{error}</p>}

        {entries.length === 0 && !loading && (
          <div className="space-y-2 px-5 py-6">
            <p className="text-foreground/85 text-footnote leading-relaxed">
              {healthOk
                ? '还没有产物。左边放下音频、选一步就能开始。'
                : '环境还没就绪，先看左下方的环境检测。'}
            </p>
            <p className="text-muted-foreground text-caption leading-relaxed">
              第一次跑要加载模型，会多等十几秒。去伴奏出人声和伴奏，去和声出主唱和和声，去混响出干声和混响成分。
            </p>
          </div>
        )}

        {entries.slice(0, 8).map((e, i) => (
          <div
            key={e.dir}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5',
              i > 0 && 'border-t border-white/7',
            )}
          >
            <span className="min-w-0 flex-1 truncate text-footnote" title={e.name}>
              {e.name}
            </span>
            <span className="readout text-muted-foreground/70 shrink-0">{e.count} 轨</span>
            <span className="readout text-muted-foreground/70 w-16 shrink-0 text-right">
              {formatBytes(e.size)}
            </span>
            <span className="readout text-muted-foreground/50 w-20 shrink-0 text-right">
              {formatRelative(e.mtime)}
            </span>
          </div>
        ))}

        {entries.length > 0 && (
          <p className="text-muted-foreground/60 border-t border-white/7 px-4 py-2.5 text-caption2">
            完整列表在「产物库」。
          </p>
        )}
      </div>
    </section>
  )
}

function JobRow({
  job,
  selected,
  first,
  onSelect,
}: {
  job: Job
  selected: boolean
  first: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={cn(
        // 分隔线由每一行自己画，和 iOS 分组列表一致
        'flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors',
        !first && 'border-t border-white/7',
        selected ? 'bg-white/8' : 'hover:bg-white/5',
      )}
    >
      <StatusDot status={job.status} />
      <span className="min-w-0 flex-1 truncate text-footnote">{job.filename}</span>
      <span className="text-muted-foreground shrink-0 text-caption">
        {MODE_META[job.mode].label}
        {job.source !== 'mix' && ` · ${SOURCE_META[job.source].label}`}
      </span>
      <span className="readout text-muted-foreground/60 w-14 shrink-0 text-right">
        {job.status === 'done' ? `${Math.round(job.elapsed)}s` : formatRelative(job.createdAt)}
      </span>
    </button>
  )
}

function StatusDot({ status }: { status: Job['status'] }) {
  const cls = {
    queued: 'bg-muted-foreground/40',
    running: 'bg-signal',
    done: 'bg-[#30d158]',
    failed: 'bg-destructive',
    cancelled: 'bg-muted-foreground/25',
    interrupted: 'bg-signal/60',
  }[status]

  if (status === 'running') {
    // 运行中：三根小电平条。这是页面上唯一持续动的东西。
    return (
      <span className="flex h-3 w-3 shrink-0 items-end justify-center gap-px" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="bg-signal h-full w-[2px] rounded-full"
            style={{ animation: `meter 1s ease-in-out ${i * 0.18}s infinite` }}
          />
        ))}
      </span>
    )
  }

  return <span className={cn('size-2 shrink-0 rounded-full', cls)} aria-hidden />
}
