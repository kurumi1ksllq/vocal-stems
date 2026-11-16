// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import type { JobOptions } from '@renderer/lib/api'
import { Label } from '@vs/ui/components/label'
import { Switch } from '@vs/ui/components/switch'
import { cn } from '@vs/ui/lib/utils'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

const FUSE_MODES = [
  { value: 'mag_median_fft', label: '幅度中位', hint: '幅度取中位，相位取最响那一路（默认）' },
  { value: 'mag_avg_fft', label: '幅度平均', hint: '幅度加权平均，相位取最响那一路' },
  { value: 'median_fft', label: '复数中位', hint: '旧算法：偶数模型时幅度会腰斩' },
  { value: 'avg_fft', label: '复数平均', hint: '旧算法：有相位抵消风险' },
]

interface OptionsPanelProps {
  opts: JobOptions
  onChange: (next: JobOptions) => void
  disabled?: boolean
}

/**
 * 高级参数。默认折叠——90% 的情况用默认值就够了，
 * 但显存不够或想对比融合算法时需要能改。
 *
 * 展开后是 iOS 的 grouped form：一行一件事，右侧控件贴边，分隔线内缩。
 */
export function OptionsPanel({ opts, onChange, disabled }: OptionsPanelProps) {
  const [open, setOpen] = useState(false)
  const isDefault =
    opts.bigshifts === 1 && opts.parallel === 2 && !opts.fuse && !opts.noMp3 && !opts.noEnsemble

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-3 text-caption transition-colors"
      >
        <span className={open ? 'text-foreground' : 'text-muted-foreground'}>更多参数</span>
        {isDefault ? (
          <span className="text-muted-foreground/60 text-caption2">按默认跑</span>
        ) : (
          <span className="text-signal text-caption2">已改动</span>
        )}
        <ChevronDown
          className={cn(
            'text-muted-foreground/60 ml-auto size-3.5 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="sheet-up space-y-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <Stepper
              label="bigshifts"
              hint="循环平移次数，2 更稳但耗时翻倍"
              value={opts.bigshifts}
              min={1}
              max={4}
              disabled={disabled}
              onChange={(v) => onChange({ ...opts, bigshifts: v })}
            />
            <Stepper
              label="并行进程"
              hint="8GB 显存给 2；显存紧张降到 1"
              value={opts.parallel}
              min={1}
              max={4}
              disabled={disabled}
              onChange={(v) => onChange({ ...opts, parallel: v })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-caption2">融合算法</Label>
            <div className="well overflow-hidden rounded-[12px]">
              {FUSE_MODES.map((m, i) => {
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
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors disabled:opacity-35',
                      i > 0 && 'border-t border-white/7',
                      active ? 'bg-white/6' : 'hover:bg-white/4',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                        active ? 'border-tint bg-tint' : 'border-white/25',
                      )}
                      aria-hidden
                    >
                      {active && <span className="size-1.5 rounded-full bg-white" />}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-caption',
                        active ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {m.label}
                    </span>
                    <span className="text-muted-foreground/60 truncate text-caption2">
                      {m.hint}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <Toggle
            id="no-ensemble"
            label="跳过融合"
            hint="只出单模型轨，省一半时间"
            checked={opts.noEnsemble}
            disabled={disabled}
            onChange={(v) => onChange({ ...opts, noEnsemble: v })}
          />
          <Toggle
            id="no-mp3"
            label="不导出 mp3"
            hint="跳过试听文件，省磁盘"
            checked={opts.noMp3}
            disabled={disabled}
            onChange={(v) => onChange({ ...opts, noMp3: v })}
          />
        </div>
      )}
    </div>
  )
}

/** 数值选择：iOS 的分段控件 */
function Stepper({
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
      <Label className="text-caption2">{label}</Label>
      <div className="well flex gap-0.5 rounded-[10px] p-0.5">
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={cn(
              'pressable readout h-7 flex-1 rounded-[8px] transition-colors disabled:opacity-35',
              value === n
                ? 'bg-white/20 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground/65 text-caption2 leading-snug">{hint}</p>
    </div>
  )
}

function Toggle({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-footnote">
          {label}
        </Label>
        <p className="text-muted-foreground/65 text-caption2">{hint}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}
