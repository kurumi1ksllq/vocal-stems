import { api, type Job } from '@renderer/lib/api'
import { MODE_META, SOURCE_META, StatusBadge } from '@renderer/lib/modes'
import { Badge } from '@vs/ui/components/badge'
import { Button } from '@vs/ui/components/button'
import { cn, formatRelative } from '@vs/ui/lib/utils'
import { Clock, FolderOpen, X } from 'lucide-react'

/** 任务标题条：模式 / 输入类型 / 文件 / 状态 / 操作 */
export function JobHeader({ job, onCancel }: { job: Job; onCancel?: () => void }) {
  const running = job.status === 'running' || job.status === 'queued'
  const meta = MODE_META[job.mode]

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('text-[14px] font-semibold', meta.accent)}>{meta.label}</span>
        <Badge variant="secondary">{SOURCE_META[job.source].label}</Badge>
        <StatusBadge job={job} />
        <span className="text-muted-foreground ml-auto flex items-center gap-1 font-mono text-[11px]">
          <Clock className="size-3" />
          {formatRelative(job.createdAt)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[12.5px]" title={job.filename}>
          {job.filename}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {job.outDir && (
            <Button
              size="icon-sm"
              variant="ghost"
              title="在资源管理器中打开产物目录"
              onClick={() => {
                const dir = job.outDir
                if (!dir) return
                void api.reveal(dir).catch(() => undefined)
              }}
            >
              <FolderOpen className="size-3.5" />
            </Button>
          )}
          {running && onCancel ? (
            <Button size="sm" variant="destructive" onClick={onCancel}>
              <X className="size-3.5" />
              取消
            </Button>
          ) : (
            !running && (
              <Button
                size="icon-sm"
                variant="ghost"
                title="从列表移除"
                onClick={() => {
                  void api.remove(job.id).catch(() => undefined)
                }}
              >
                <X className="size-3.5" />
              </Button>
            )
          )}
        </div>
      </div>

      <p
        className="text-muted-foreground truncate font-mono text-[10.5px]"
        title={job.outDir ?? ''}
      >
        {job.outDir ?? '—'}
      </p>
    </div>
  )
}
