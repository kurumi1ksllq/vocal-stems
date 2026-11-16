// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { api, type Job } from '@renderer/lib/api'
import { MODE_META, SOURCE_META, StatusBadge } from '@renderer/lib/modes'
import { Button } from '@vs/ui/components/button'
import { FolderOpen, X } from 'lucide-react'

/** 任务标题条：文件名最大，模式与状态是它的属性，操作贴在右侧。 */
export function JobHeader({ job, onCancel }: { job: Job; onCancel?: () => void }) {
  const running = job.status === 'running' || job.status === 'queued'

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-subhead leading-snug font-semibold" title={job.filename}>
            {job.filename}
          </p>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption2">
            <span>{MODE_META[job.mode].label}</span>
            <span className="text-foreground/20">·</span>
            <span>输入 {SOURCE_META[job.source].label}</span>
            <span className="text-foreground/20">·</span>
            <StatusBadge job={job} />
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {job.outDir && (
            <Button
              size="sm"
              variant="secondary"
              title="在资源管理器中打开产物目录"
              onClick={() => {
                const dir = job.outDir
                if (!dir) return
                void api.reveal(dir).catch(() => undefined)
              }}
            >
              <FolderOpen className="size-3.5" />
              目录
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
                aria-label="从列表移除"
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

      {job.outDir && (
        <p className="text-muted-foreground/60 truncate font-mono text-caption2" title={job.outDir}>
          {job.outDir}
        </p>
      )}
    </div>
  )
}
