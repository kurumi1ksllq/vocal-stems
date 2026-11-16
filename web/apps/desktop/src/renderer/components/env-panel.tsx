// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import type { Health, WeightEntry } from '@renderer/lib/api'
import { Button } from '@vs/ui/components/button'
import { cn, formatBytes } from '@vs/ui/lib/utils'
import { RefreshCw } from 'lucide-react'

interface EnvPanelProps {
  health: Health | null
  weights: WeightEntry[]
  error: string | null
  loading: boolean
  onRefresh: () => void
  compact?: boolean
}

/** 三个脚本各需要哪些权重，缺一个对应功能就废 */
const REQUIRED = [
  { name: 'model_melband_kj_fp16.ckpt', mode: '去伴奏' },
  { name: 'mel_band_roformer_vocals_gabox_fp16.ckpt', mode: '去伴奏' },
  { name: 'karaoke_bs_roformer_anvuew_fp16.ckpt', mode: '去和声' },
  { name: 'mel_band_roformer_karaoke_gabox_fp16.ckpt', mode: '去和声' },
  { name: 'dereverb_bs_roformer_anvuew_sdr_22.5050_fp16.ckpt', mode: '去混响' },
]

/**
 * 环境体检。这个项目的失败几乎都出在环境上：少权重、ffmpeg 路径没了、CUDA 掉了。
 *
 * 但它是背景信息，不是主要工作。所以做成 iOS 的 grouped list：
 * 一块玻璃、每行一件事、右侧一个读数，出问题才展开细节。
 */
export function EnvPanel({ health, weights, error, loading, onRefresh }: EnvPanelProps) {
  const present = new Set(weights.map((w) => w.name))
  const missing = REQUIRED.filter((r) => !present.has(r.name))
  const totalWeight = weights.reduce((s, w) => s + w.size, 0)

  const label = (
    <div className="group-label mb-2 flex items-baseline gap-2 px-4">
      <span>环境</span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        title="重新检测"
        aria-label="重新检测环境"
        className="text-tint ml-auto inline-flex items-center gap-1 font-normal"
      >
        <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        检测
      </button>
    </div>
  )

  if (error) {
    return (
      <section>
        {label}
        <div className="glass border-destructive/30 rounded-[18px] border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="bg-destructive size-2 shrink-0 rounded-full" aria-hidden />
            <span className="text-destructive text-footnote font-medium">主进程未就绪</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={onRefresh}>
              重试
            </Button>
          </div>
          <p className="text-muted-foreground mt-1.5 text-caption leading-relaxed">{error}</p>
          <p className="text-muted-foreground/60 mt-1 text-caption2 leading-relaxed">
            前端只是壳子，分离脚本由主进程拉起。重启应用试试。
          </p>
        </div>
      </section>
    )
  }

  return (
    <section>
      {label}

      <div className="glass border-white/10 overflow-hidden rounded-[18px] border">
        <Row
          label="显卡"
          value={shortDevice(health?.cuda.available ? health.cuda.device : null, loading)}
          bad={!health?.cuda.available}
          first
        />
        <Row
          label="权重"
          value={`${weights.length} 个 · ${formatBytes(totalWeight)}`}
          bad={missing.length > 0}
        />
        <Row
          label="ffmpeg"
          value={health?.ffmpeg.exists ? '就绪' : '缺失'}
          bad={!health?.ffmpeg.exists}
        />

        {missing.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-signal text-caption">{missing.length} 个权重缺失，对应功能会失败</p>
            <ul className="mt-1.5 space-y-0.5">
              {missing.map((m) => (
                <li
                  key={m.name}
                  className="text-muted-foreground flex items-baseline gap-1.5 text-caption2"
                >
                  <span className="shrink-0 opacity-60">缺</span>
                  <span className="truncate font-mono" title={m.name}>
                    {m.name}
                  </span>
                  <span className="shrink-0 opacity-60">{m.mode}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

function Row({
  label,
  value,
  bad,
  first,
}: {
  label: string
  value: string
  bad?: boolean
  first?: boolean
}) {
  return (
    <div
      className={cn('flex items-baseline gap-3 px-4 py-2.5', !first && 'border-t border-white/7')}
    >
      <span className="text-footnote shrink-0">{label}</span>
      <span
        className={cn(
          'readout ml-auto truncate text-right',
          bad ? 'text-signal' : 'text-muted-foreground',
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * 显卡名通常是 "NVIDIA GeForce RTX 3070"。这一格宽度有限，
 * 完整名会被截成「NVIDIA GeForce RT…」，恰好把唯一有辨识度的型号切掉。
 * 所以只留型号，完整名放 title。
 */
function shortDevice(device: string | null, loading: boolean): string {
  if (!device) return loading ? '检测中' : '未找到'
  const m = /(RTX|GTX|RX|Arc)\s*[A-Z0-9 ]+$/i.exec(device)
  if (m) return m[0].trim()
  return device.replace(/^(NVIDIA|AMD|Intel)\s+(GeForce|Radeon|Arc)\s+/i, '')
}
