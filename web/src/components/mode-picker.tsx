import { ArrowRight, Info } from 'lucide-react'
import type { ModeKey, SourceKey } from '@/lib/api'
import { MODE_META, SOURCE_META, sourceOptions } from '@/lib/modes'
import { cn } from '@/lib/utils'

const ORDER: ModeKey[] = ['stems', 'karaoke', 'dereverb']

interface ModePickerProps {
  mode: ModeKey
  source: SourceKey
  onChange: (mode: ModeKey, source: SourceKey) => void
  disabled?: boolean
}

/**
 * 模式选择：视觉上是一条「流水线」——伴奏 → 主唱 → 干声。
 * 选右侧模式时，如果输入还没到那一步，自动提示会先跑前置。
 */
export function ModePicker({ mode, source, onChange, disabled }: ModePickerProps) {
  const options = sourceOptions(mode)

  const pick = (m: ModeKey) => {
    const opts = sourceOptions(m)
    // 切模式时保留用户原先的输入类型（如果新模式也支持）
    const keep = opts.find((o) => o.key === source) ?? opts[0]
    onChange(m, keep.key)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {ORDER.map((m, i) => {
          const meta = MODE_META[m]
          const active = mode === m
          return (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => pick(m)}
              className={cn(
                'group relative flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-all disabled:opacity-50',
                active
                  ? 'border-primary/60 bg-primary/8'
                  : 'border-border/60 bg-background/30 hover:border-border hover:bg-background/50',
              )}
            >
              <div className="flex w-full items-center gap-1.5">
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold tabular-nums',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <span
                  className={cn(
                    'text-[13px] font-medium',
                    active ? 'text-foreground' : 'text-foreground/80',
                  )}
                >
                  {meta.label}
                </span>
                {i < ORDER.length - 1 && (
                  <ArrowRight className="text-muted-foreground/40 ml-auto size-3" />
                )}
              </div>
              <span className="text-muted-foreground line-clamp-2 text-[10.5px] leading-snug">
                {meta.outputs}
              </span>
            </button>
          )
        })}
      </div>

      <div className="space-y-1.5">
        <p className="text-muted-foreground text-[11px]">{MODE_META[mode].desc}</p>
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const active = source === o.key
            return (
              <button
                key={o.key}
                type="button"
                disabled={disabled}
                onClick={() => onChange(mode, o.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] transition-colors disabled:opacity-50',
                  active
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
                )}
                title={SOURCE_META[o.key].hint}
              >
                输入：{SOURCE_META[o.key].label}
                {o.cascade && <span className="text-[10px] opacity-70">· {o.cascade}</span>}
              </button>
            )
          })}
        </div>
        {options.length > 1 && (
          <p className="text-muted-foreground/70 flex items-start gap-1 text-[10.5px] leading-snug">
            <Info className="mt-0.5 size-3 shrink-0" />
            选「整曲」会自动串联前置步骤，耗时叠加（去伴奏约 1.5 分钟/首）。
          </p>
        )}
      </div>
    </div>
  )
}
