// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import type { ModeKey, SourceKey } from '@renderer/lib/api'
import { MODE_META, SOURCE_META, sourceOptions } from '@renderer/lib/modes'
import { cn } from '@vs/ui/lib/utils'

const ORDER: ModeKey[] = ['stems', 'karaoke', 'dereverb']

/** 每一步产出的「主轨」颜色，用来给这一步做标记 */
const STEP_COLOR: Record<ModeKey, string> = {
  stems: 'var(--stem-vocal)',
  karaoke: 'var(--stem-backing)',
  dereverb: 'var(--stem-inst)',
}

interface ModePickerProps {
  mode: ModeKey
  source: SourceKey
  onChange: (mode: ModeKey, source: SourceKey) => void
  disabled?: boolean
}

/**
 * 模式选择。
 *
 * 上半是 iOS 的分段控件（segmented control）：一个凹槽里三格，
 * 选中那格是滑动的白色滑块——这是 iOS 最有辨识度的控件，也正好合适：
 * 三选一、互斥、需要一眼看清当前值。
 *
 * 下半是输入的 pill 选择。「做什么」和「拿什么做」是两件事，不该混在一组里。
 */
export function ModePicker({ mode, source, onChange, disabled }: ModePickerProps) {
  const options = sourceOptions(mode)

  const pick = (m: ModeKey) => {
    const opts = sourceOptions(m)
    // 切模式时保留用户原先的输入类型（如果新模式也支持）
    const keep = opts.find((o) => o.key === source) ?? opts[0]
    if (!keep) return
    onChange(m, keep.key)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="text-muted-foreground px-1 text-caption2">做什么</span>

        {/* 分段控件：凹槽 + 滑块 */}
        <div className="well relative flex gap-1 rounded-[12px] p-1">
          {ORDER.map((m) => {
            const active = mode === m
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => pick(m)}
                className={cn(
                  'pressable relative flex-1 rounded-[9px] px-2 py-2 text-center transition-colors',
                  active
                    ? 'bg-white/18 text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.14)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <span
                    className="size-1.5 rounded-full transition-opacity"
                    style={{ background: STEP_COLOR[m], opacity: active ? 1 : 0.5 }}
                    aria-hidden
                  />
                  <span className="text-caption font-medium">{MODE_META[m].label}</span>
                </span>
                <span className="mt-0.5 block text-caption2 leading-tight opacity-70">
                  {MODE_META[m].outputs}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-muted-foreground px-1 text-caption2">拿什么当输入</span>
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const active = source === o.key
            return (
              <button
                key={o.key}
                type="button"
                disabled={disabled}
                onClick={() => onChange(mode, o.key)}
                title={SOURCE_META[o.key].hint}
                className={cn(
                  'pressable rounded-full px-3 py-1.5 text-caption transition-colors disabled:opacity-35',
                  active
                    ? 'bg-tint/20 text-tint'
                    : 'bg-white/7 text-muted-foreground hover:bg-white/12 hover:text-foreground',
                )}
              >
                {SOURCE_META[o.key].label}
                {o.cascade && <span className="opacity-70"> · {o.cascade}</span>}
              </button>
            )
          })}
        </div>
        {options.length > 1 && (
          <p className="text-muted-foreground/70 px-1 text-caption2 leading-snug">
            选「整曲」会先自动跑前置步骤，耗时叠加（去伴奏约 1.5 分钟一首）。
          </p>
        )}
      </div>
    </div>
  )
}
