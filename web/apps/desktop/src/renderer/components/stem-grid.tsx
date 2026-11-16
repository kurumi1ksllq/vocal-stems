import { StemPlayer } from '@renderer/components/stem-player'
import type { ResultDir, Stem } from '@renderer/lib/api'
import { Badge } from '@vs/ui/components/badge'
import { Button } from '@vs/ui/components/button'
import { cn, formatBytes } from '@vs/ui/lib/utils'
import { Download, Loader2, Music2 } from 'lucide-react'
import { useState } from 'react'

const KEY_COLOR: Record<string, string> = {
  vocal: 'var(--stem-vocal)',
  inst: 'var(--stem-inst)',
  backing: 'var(--stem-backing)',
  reverb: 'var(--stem-reverb)',
  dereverb: 'var(--stem-inst)',
  other: 'var(--muted-foreground)',
}

const FUSE_LABEL: Record<string, string> = {
  mag_median_fft: '融合 · 幅度中位',
  mag_avg_fft: '融合 · 幅度平均',
  median_fft: '融合 · 复数中位（旧）',
  avg_fft: '融合 · 复数平均（旧）',
}

interface StemGridProps {
  result: ResultDir
  /** 只显示融合产物，隐藏单模型轨 */
  fusedOnly?: boolean
}

/**
 * 产物网格。同一时刻只允许一条轨播放，切换时自动暂停上一条。
 * 单模型轨默认折叠——融合结果才是交付物。
 */
export function StemGrid({ result, fusedOnly = true }: StemGridProps) {
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(!fusedOnly)
  const [boundDir, setBoundDir] = useState(result.dir)

  // 换目录时立刻停掉上一条轨，避免跨目录残留播放
  if (boundDir !== result.dir) {
    setBoundDir(result.dir)
    setPlayingUrl(null)
  }

  const fused = result.stems.filter((s) => s.fused)
  const singles = result.stems.filter((s) => !s.fused)
  const shown = showAll ? [...fused, ...singles] : fused.length > 0 ? fused : singles

  if (result.stems.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-[13px]">
        <Music2 className="size-5 opacity-50" />
        这个目录里没有 wav 产物
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {fused.length > 0 && <Badge variant="success">{fused.length} 个融合产物</Badge>}
          {singles.length > 0 && <Badge variant="outline">{singles.length} 个单模型轨</Badge>}
          {result.stems.some((s) => s.mp3Url) && <Badge variant="info">mp3 试听已导出</Badge>}
        </div>
        {fused.length > 0 && singles.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? '只看融合' : '展开单模型'}
          </Button>
        )}
      </div>

      <div className="grid gap-2.5">
        {shown.map((stem) => (
          <StemRow
            key={stem.name}
            stem={stem}
            color={KEY_COLOR[stem.kind] ?? KEY_COLOR.other ?? 'currentColor'}
            playingUrl={playingUrl}
            onPlayUrl={setPlayingUrl}
          />
        ))}
      </div>
    </div>
  )
}

function StemRow({
  stem,
  color,
  playingUrl,
  onPlayUrl,
}: {
  stem: Stem
  color: string
  playingUrl: string | null
  onPlayUrl: (url: string | null) => void
}) {
  const fuseText = stem.fuseMode ? FUSE_LABEL[stem.fuseMode] : null

  return (
    <div
      className={cn(
        'rounded-xl border bg-card/40 p-3 transition-colors',
        stem.fused ? 'border-border/80' : 'border-border/45',
      )}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="truncate text-[13px] font-medium" title={stem.name}>
          {stem.label}
        </span>
        {fuseText ? (
          <Badge variant="teal" className="shrink-0">
            {fuseText}
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0">
            单模型
          </Badge>
        )}
        <span className="text-muted-foreground ml-auto shrink-0 font-mono text-[11px]">
          {formatBytes(stem.size)}
        </span>
        <a
          href={stem.url}
          download={stem.name}
          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
          title={`下载 ${stem.name}`}
          aria-label={`下载 ${stem.name}`}
        >
          <Download className="size-3.5" />
        </a>
      </div>

      <StemPlayer
        url={stem.url}
        label={stem.label}
        color={color}
        playingUrl={playingUrl}
        onPlayUrl={onPlayUrl}
      />

      <div
        className="text-muted-foreground mt-1.5 truncate font-mono text-[10.5px] opacity-70"
        title={stem.name}
      >
        {stem.name}
      </div>
      {stem.mp3Url && (
        <a
          href={stem.mp3Url}
          download
          className="text-muted-foreground hover:text-primary mt-1 inline-flex items-center gap-1 text-[11px] transition-colors"
        >
          <Download className="size-3" />
          下载 mp3 试听
        </a>
      )}
    </div>
  )
}

/** 结果加载占位 */
export function StemGridSkeleton() {
  return (
    <div className="space-y-2.5">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-border/50 bg-card/30 p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="bg-secondary/70 h-3.5 w-24 animate-pulse rounded" />
            <div className="bg-secondary/50 h-3.5 w-20 animate-pulse rounded-full" />
          </div>
          <div className="bg-secondary/40 flex h-10 animate-pulse items-center justify-center rounded-lg">
            <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
          </div>
        </div>
      ))}
    </div>
  )
}
