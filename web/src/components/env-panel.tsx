import { Activity, Cpu, HardDrive, Server, TriangleAlert, Weight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { Health, WeightEntry } from '@/lib/api'
import { cn, formatBytes } from '@/lib/utils'

interface EnvPanelProps {
  health: Health | null
  weights: WeightEntry[]
  error: string | null
  loading: boolean
  onRefresh: () => void
  compact?: boolean
}

/**
 * 环境体检。这个项目的失败几乎都出在环境上：
 * 少权重、ffmpeg 路径没了、CUDA 掉了。所以把这些摆在显眼位置。
 */
export function EnvPanel({
  health,
  weights,
  error,
  loading,
  onRefresh,
  compact = false,
}: EnvPanelProps) {
  // 三个脚本各需要哪些权重，缺一个对应功能就废
  const REQUIRED = [
    { name: 'model_melband_kj_fp16.ckpt', mode: '去伴奏' },
    { name: 'mel_band_roformer_vocals_gabox_fp16.ckpt', mode: '去伴奏' },
    { name: 'karaoke_bs_roformer_anvuew_fp16.ckpt', mode: '去和声' },
    { name: 'mel_band_roformer_karaoke_gabox_fp16.ckpt', mode: '去和声' },
    { name: 'dereverb_bs_roformer_anvuew_sdr_22.5050_fp16.ckpt', mode: '去混响' },
  ]
  const present = new Set(weights.map((w) => w.name))
  const missing = REQUIRED.filter((r) => !present.has(r.name))
  const totalWeight = weights.reduce((s, w) => s + w.size, 0)

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="size-4" />
            后端未连接
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-[12.5px] leading-relaxed">
            {error}
            <br />
            先在仓库根目录启动：
          </p>
          <code className="bg-background/70 block overflow-x-auto rounded-md border border-border/60 px-2.5 py-2 font-mono text-[11.5px]">
            .venv\Scripts\python.exe web\server\app.py
          </code>
          <Button size="sm" variant="secondary" onClick={onRefresh} disabled={loading}>
            重试
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(compact && 'gap-3 py-4')}>
      <CardHeader className={cn('flex-row items-center justify-between', compact && 'px-4')}>
        <CardTitle className="flex items-center gap-2">
          <Server className="text-muted-foreground size-3.5" />
          环境
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <Badge variant={health?.cuda.available ? 'success' : 'warning'}>
            <Cpu className="size-3" />
            {health?.cuda.available ? 'CUDA' : 'CPU'}
          </Badge>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={loading}
            title="刷新环境信息"
          >
            <Activity className={cn('size-3.5', loading && 'animate-pulse')} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className={cn('space-y-2.5', compact && 'px-4')}>
        <Row
          icon={<Cpu className="size-3.5" />}
          label="显卡"
          value={health?.cuda.device ?? (loading ? '检测中…' : '未检测到')}
          good={health?.cuda.available}
        />
        <Row
          icon={<Weight className="size-3.5" />}
          label="权重"
          value={`${weights.length} 个 · ${formatBytes(totalWeight)}`}
          good={missing.length === 0}
        />
        <Row
          icon={<HardDrive className="size-3.5" />}
          label="ffmpeg"
          value={health?.ffmpeg.exists ? '已就绪' : '缺失'}
          good={health?.ffmpeg.exists}
        />

        {missing.length > 0 && (
          <>
            <Separator className="my-1" />
            <div className="space-y-1.5">
              <p className="text-amber-400 text-[11.5px] font-medium">
                {missing.length} 个权重缺失，对应功能会失败
              </p>
              <ul className="space-y-1">
                {missing.map((m) => (
                  <li
                    key={m.name}
                    className="text-muted-foreground flex items-baseline gap-1.5 text-[10.5px]"
                  >
                    <span className="text-muted-foreground/60 shrink-0">·</span>
                    <span className="truncate font-mono" title={m.name}>
                      {m.name}
                    </span>
                    <span className="shrink-0 opacity-70">({m.mode})</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {!compact && health && (
          <>
            <Separator className="my-1" />
            <dl className="text-muted-foreground space-y-1 font-mono text-[10.5px]">
              <div className="flex gap-2">
                <dt className="shrink-0 opacity-60">根目录</dt>
                <dd className="truncate" title={health.root}>
                  {health.root}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 opacity-60">输出</dt>
                <dd className="truncate" title={health.outRoot}>
                  {health.outRoot}
                </dd>
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Row({
  icon,
  label,
  value,
  good,
}: {
  icon: React.ReactNode
  label: string
  value: string
  good?: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="text-muted-foreground/70">{icon}</span>
      <span className="text-muted-foreground w-12 shrink-0">{label}</span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-right',
          good === false ? 'text-amber-400' : 'text-foreground/85',
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}
