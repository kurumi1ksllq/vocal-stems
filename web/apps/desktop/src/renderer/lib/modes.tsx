// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import type { Job, ModeKey, SourceKey } from '@renderer/lib/api'
import { cn } from '@vs/ui/lib/utils'

export const MODE_META: Record<
  ModeKey,
  { label: string; desc: string; outputs: string; accent: string }
> = {
  stems: {
    label: '去伴奏',
    desc: '整曲进来，人声（含和声）和伴奏分家',
    outputs: '人声 + 伴奏',
    accent: 'text-stem-vocal',
  },
  karaoke: {
    label: '去和声',
    desc: '从人声轨里再拆出纯主唱与和声',
    outputs: '主唱 + 和声',
    accent: 'text-stem-backing',
  },
  dereverb: {
    label: '去混响',
    desc: '把混响尾巴从人声里剥出来',
    outputs: '干声 + 混响',
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

const STATUS: Record<Job['status'], { text: string; cls: string; dot: string }> = {
  queued: { text: '排队中', cls: 'text-muted-foreground', dot: 'bg-muted-foreground/50' },
  running: { text: '处理中', cls: 'text-signal', dot: 'bg-signal' },
  done: { text: '已完成', cls: 'text-[#30d158]', dot: 'bg-[#30d158]' },
  failed: { text: '失败', cls: 'text-destructive', dot: 'bg-destructive' },
  cancelled: { text: '已取消', cls: 'text-muted-foreground/70', dot: 'bg-muted-foreground/35' },
  // 上次运行被中途掐断（关窗、崩溃、Ctrl+C）。和历史「已取消」分开：
  // 这不是用户主动取消，而是没跑完。
  interrupted: { text: '已中断', cls: 'text-signal/80', dot: 'bg-signal/60' },
}

/** 状态。iOS 里状态是「一个色点 + 一个词」，不做徽章框。 */
export function StatusBadge({ job }: { job: Job }) {
  const s = STATUS[job.status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-caption2', s.cls)}>
      <span className={cn('size-1.5 rounded-full', s.dot)} aria-hidden />
      {s.text}
    </span>
  )
}
