import type { Job, ModeKey, SourceKey } from '@renderer/lib/api'
import { Badge } from '@vs/ui/components/badge'
import { cn } from '@vs/ui/lib/utils'

export const MODE_META: Record<
  ModeKey,
  { label: string; desc: string; outputs: string; accent: string }
> = {
  stems: {
    label: '去伴奏',
    desc: '整曲进来，人声（含和声）和伴奏分家',
    outputs: '人声（含和声） · 伴奏',
    accent: 'text-stem-vocal',
  },
  karaoke: {
    label: '去和声',
    desc: '从人声轨里再拆出纯主唱与和声',
    outputs: '纯主唱 · 和声',
    accent: 'text-stem-backing',
  },
  dereverb: {
    label: '去混响',
    desc: '把混响尾巴从人声里剥出来',
    outputs: '干声 · 混响成分',
    accent: 'text-stem-inst',
  },
}

export const SOURCE_META: Record<SourceKey, { label: string; hint: string }> = {
  mix: { label: '整曲', hint: '含伴奏的完整混音' },
  vocals: { label: '人声轨', hint: '已去掉伴奏的人声' },
  karaoke: { label: '纯主唱', hint: '已去掉和声的主唱' },
}

/** 当前模式下可选的输入类型 + 会触发的前置级联 */
export function sourceOptions(mode: ModeKey): { key: SourceKey; cascade?: string }[] {
  if (mode === 'stems') return [{ key: 'mix' }]
  if (mode === 'karaoke') return [{ key: 'vocals' }, { key: 'mix', cascade: '先自动去伴奏' }]
  return [
    { key: 'vocals' },
    { key: 'mix', cascade: '先自动去伴奏' },
    { key: 'karaoke', cascade: '先去伴奏再去和声' },
  ]
}

export function StatusBadge({ job }: { job: Job }) {
  const map = {
    queued: { variant: 'outline' as const, text: '排队中' },
    running: { variant: 'warning' as const, text: '处理中' },
    done: { variant: 'success' as const, text: '已完成' },
    failed: { variant: 'danger' as const, text: '失败' },
    cancelled: { variant: 'secondary' as const, text: '已取消' },
  }
  const s = map[job.status]
  return (
    <Badge variant={s.variant} className={cn(job.status === 'running' && 'animate-pulse')}>
      {job.status === 'running' && (
        <span className="size-1.5 rounded-full bg-amber-400 animate-pulse-ring" />
      )}
      {s.text}
    </Badge>
  )
}
