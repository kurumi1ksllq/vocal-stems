import type { JobOptions } from '@renderer/lib/api'
import { Badge } from '@vs/ui/components/badge'
import { Label } from '@vs/ui/components/label'
import { Switch } from '@vs/ui/components/switch'
import { cn } from '@vs/ui/lib/utils'
import { ChevronDown, Settings2 } from 'lucide-react'
import { useState } from 'react'

const FUSE_MODES = [
  { value: 'mag_median_fft', label: '幅度中位（默认）', hint: '幅度取中位，相位取最响那一路' },
  { value: 'mag_avg_fft', label: '幅度平均', hint: '幅度加权平均，相位取最响那一路' },
  { value: 'median_fft', label: '复数中位（旧）', hint: '偶数模型时幅度会腰斩，不建议' },
  { value: 'avg_fft', label: '复数平均（旧）', hint: '相位抵消风险，不建议' },
]

interface OptionsPanelProps {
  opts: JobOptions
  onChange: (next: JobOptions) => void
  disabled?: boolean
}

/**
 * 高级参数。默认折叠——90% 的情况用默认值就够了，
 * 但显存不够或想对比融合算法时需要能改。
 */
export function OptionsPanel({ opts, onChange, disabled }: OptionsPanelProps) {
  const [open, setOpen] = useState(false)
  const isDefault =
    opts.bigshifts === 1 && opts.parallel === 2 && !opts.fuse && !opts.noMp3 && !opts.noEnsemble

  return (
    <div className="rounded-lg border border-border/60 bg-background/25">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-3 py-2 text-[12px] transition-colors"
      >
        <Settings2 className="size-3.5" />
        <span>高级参数</span>
        {!isDefault && <Badge variant="warning">已修改</Badge>}
        <ChevronDown
          className={cn('ml-auto size-3.5 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="animate-fade-up space-y-3.5 border-t border-border/60 px-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="bigshifts"
              hint="循环平移平均次数，2 更稳但耗时翻倍"
              value={opts.bigshifts}
              min={1}
              max={4}
              disabled={disabled}
              onChange={(v) => onChange({ ...opts, bigshifts: v })}
            />
            <Field
              label="并行进程"
              hint="8GB 显存建议 2，显存紧张改 1"
              value={opts.parallel}
              min={1}
              max={4}
              disabled={disabled}
              onChange={(v) => onChange({ ...opts, parallel: v })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>融合算法</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {FUSE_MODES.map((m) => {
                const active = opts.fuse === m.value || (!opts.fuse && m.value === 'mag_median_fft')
                return (
                  <button
                    key={m.value}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...opts,
                        // 选默认值就回退成空串，等价于不传 --fuse
                        fuse: m.value === 'mag_median_fft' ? '' : m.value,
                      })
                    }
                    title={m.hint}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors disabled:opacity-50',
                      active
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
                    )}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="no-ensemble" className="text-[12px]">
                跳过融合
              </Label>
              <p className="text-muted-foreground/70 text-[10.5px]">只出单模型轨，省一半时间</p>
            </div>
            <Switch
              id="no-ensemble"
              checked={opts.noEnsemble}
              disabled={disabled}
              onCheckedChange={(v) => onChange({ ...opts, noEnsemble: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="no-mp3" className="text-[12px]">
                不导出 mp3
              </Label>
              <p className="text-muted-foreground/70 text-[10.5px]">跳过试听文件，省磁盘</p>
            </div>
            <Switch
              id="no-mp3"
              checked={opts.noMp3}
              disabled={disabled}
              onCheckedChange={(v) => onChange({ ...opts, noMp3: v })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px]">{label}</Label>
      <div className="flex items-center gap-1">
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              'h-7 flex-1 rounded-md border font-mono text-[11.5px] transition-colors disabled:opacity-50',
              value === n
                ? 'border-primary/60 bg-primary/12 text-primary'
                : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground/70 text-[10px] leading-snug">{hint}</p>
    </div>
  )
}
