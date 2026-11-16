// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { StemPlayer } from '@renderer/components/stem-player'
import type { ResultDir, Stem } from '@renderer/lib/api'
import { Button } from '@vs/ui/components/button'
import { formatBytes } from '@vs/ui/lib/utils'
import { Download } from 'lucide-react'
import { useState } from 'react'

const KEY_COLOR: Record<string, string> = {
  vocal: 'var(--stem-vocal)',
  inst: 'var(--stem-inst)',
  backing: 'var(--stem-backing)',
  reverb: 'var(--stem-reverb)',
  dereverb: 'var(--stem-inst)',
  other: 'var(--stem-reverb)',
}

const FUSE_LABEL: Record<string, string> = {
  mag_median_fft: '幅度中位',
  mag_avg_fft: '幅度平均',
  median_fft: '复数中位',
  avg_fft: '复数平均',
}

interface StemGridProps {
  result: ResultDir
  /** 只显示融合产物，隐藏单模型轨 */
  fusedOnly?: boolean
}

/**
 * 产物列表。每行是一条轨，左侧色点标明身份，中间是波形，右侧是下载。
 * 同一时刻只允许一条轨播放，切换时自动暂停上一条。
 *
 * 用 iOS grouped list：每轨一张内嵌卡片，卡片之间留 8px。
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
    return <p className="text-muted-foreground py-4 text-caption">这个目录里没有 wav 产物。</p>
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-caption2">
          {shown.length} 条轨
          {singles.length > 0 && !showAll && ` · 另有 ${singles.length} 条单模型`}
        </span>
        {fused.length > 0 && singles.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? '只看融合结果' : '显示单模型轨'}
          </Button>
        )}
      </div>

      <div className="space-y-2">
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
    <div className="glass border-white/10 rounded-[16px] border px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        <span className="truncate text-footnote font-medium" title={stem.name}>
          {stem.label}
        </span>
        <span className="text-muted-foreground/70 shrink-0 text-caption2">
          {fuseText ?? '单模型'}
        </span>
        <span className="readout text-muted-foreground ml-auto shrink-0">
          {formatBytes(stem.size)}
        </span>
        <a
          href={stem.url}
          download={stem.name}
          className="text-tint hover:text-tint/80 shrink-0 transition-colors"
          title={`下载 ${stem.name}`}
          aria-label={`下载 ${stem.name}`}
        >
          <Download className="size-3.5" />
        </a>
      </div>

      <div className="mt-2.5">
        <StemPlayer
          url={stem.url}
          label={stem.label}
          color={color}
          playingUrl={playingUrl}
          onPlayUrl={onPlayUrl}
        />
      </div>

      <div className="text-muted-foreground/50 mt-1.5 flex items-center gap-2 font-mono text-caption2">
        <span className="truncate" title={stem.name}>
          {stem.name}
        </span>
        {stem.mp3Url && (
          <a
            href={stem.mp3Url}
            download
            className="text-tint hover:text-tint/80 shrink-0 underline-offset-2 transition-colors hover:underline"
          >
            mp3
          </a>
        )}
      </div>
    </div>
  )
}

/** 结果加载占位：保持和真实行一样的骨架，避免跳版 */
export function StemGridSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1].map((i) => (
        <div key={i} className="glass border-white/10 space-y-2 rounded-[16px] border px-3.5 py-3">
          <div className="flex items-center gap-2">
            <div className="bg-white/12 h-2.5 w-16 animate-pulse rounded-full" />
            <div className="bg-white/8 h-2.5 w-10 animate-pulse rounded-full" />
          </div>
          <div className="well h-9 animate-pulse rounded-[12px]" />
        </div>
      ))}
    </div>
  )
}
