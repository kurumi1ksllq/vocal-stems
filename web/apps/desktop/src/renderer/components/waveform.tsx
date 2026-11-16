// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { cn } from '@vs/ui/lib/utils'
import { useEffect, useRef, useState } from 'react'

type Peaks = { min: number[]; max: number[] }

const cache = new Map<string, Peaks>()
const inflight = new Map<string, Promise<Peaks>>()

/** 拉一次音频，解出逐像素的峰值包络。同一 URL 只解析一次。 */
async function loadPeaks(url: string, bins: number): Promise<Peaks> {
  const key = `${url}#${bins}`
  const hit = cache.get(key)
  if (hit) return hit
  const running = inflight.get(key)
  if (running) return running

  const task = (async (): Promise<Peaks> => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    try {
      const audio = await ctx.decodeAudioData(buf)
      const ch = audio.getChannelData(0)
      const block = Math.max(1, Math.floor(ch.length / bins))
      const min: number[] = []
      const max: number[] = []
      for (let i = 0; i < bins; i++) {
        const start = i * block
        const end = Math.min(ch.length, start + block)
        let lo = 0
        let hi = 0
        for (let j = start; j < end; j++) {
          const v = ch[j]
          if (v === undefined) continue
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
        min.push(lo)
        max.push(hi)
      }
      const peaks = { min, max }
      cache.set(key, peaks)
      return peaks
    } finally {
      void ctx.close()
    }
  })()

  inflight.set(key, task)
  try {
    return await task
  } finally {
    inflight.delete(key)
  }
}

export interface WaveformProps {
  url: string | null
  /** 0–1，播放进度 */
  progress?: number
  /** 主题色（CSS 颜色） */
  color?: string
  height?: number
  bins?: number
  className?: string
  onSeek?: (ratio: number) => void
}

/**
 * 真实波形：解码音频后按列求 min/max 画成竖线。
 * 解码失败时退化成一条静态中线，不影响页面其他部分。
 */
export function Waveform({
  url,
  progress = 0,
  color = 'currentColor',
  height = 56,
  bins = 160,
  className,
  onSeek,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [peaks, setPeaks] = useState<Peaks | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!url) {
      setPeaks(null)
      return
    }
    let alive = true
    setFailed(false)
    loadPeaks(url, bins)
      .then((p) => {
        if (alive) setPeaks(p)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [url, bins])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = height
    canvas.width = Math.max(1, Math.round(w * dpr))
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const mid = h / 2
    const amp = mid - 2

    if (!peaks) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, Math.round(mid) + 0.5)
      ctx.lineTo(w, Math.round(mid) + 0.5)
      ctx.stroke()
      return
    }

    const n = peaks.min.length
    const barW = w / n
    const playedX = w * Math.min(1, Math.max(0, progress))

    for (let i = 0; i < n; i++) {
      const x = i * barW
      const top = mid - (peaks.max[i] ?? 0) * amp
      const bottom = mid - (peaks.min[i] ?? 0) * amp
      const played = x <= playedX
      ctx.globalAlpha = played ? 0.95 : 0.22
      ctx.fillStyle = color
      ctx.fillRect(x, top, Math.max(barW * 0.62, 1), Math.max(bottom - top, 1))
    }
    ctx.globalAlpha = 1

    // 播放头：一条 1px 竖线，不做圆角或光晕
    if (progress > 0 && progress < 1) {
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(Math.round(playedX) + 0.5, 0)
      ctx.lineTo(Math.round(playedX) + 0.5, h)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }, [peaks, progress, color, height])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return
    const rect = e.currentTarget.getBoundingClientRect()
    onSeek((e.clientX - rect.left) / rect.width)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onSeek) return
    // 方向键按 2% 步进跳转，Home/End 到两端
    const step = 0.02
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      onSeek(Math.min(1, progress + step))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onSeek(Math.max(0, progress - step))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onSeek(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      onSeek(1)
    }
  }

  const canvas = <canvas ref={canvasRef} className="h-full w-full" />

  const fallback = failed && (
    <span className="text-muted-foreground/70 absolute inset-0 flex items-center justify-center text-2xs">
      波形不可用
    </span>
  )

  // 纯展示：不含任何交互属性，语义上就是一个装饰图
  if (!onSeek) {
    return (
      <div
        className={cn('relative w-full select-none', className)}
        style={{ height }}
        role="img"
        aria-label="音频波形"
      >
        {canvas}
        {fallback}
      </div>
    )
  }

  // 可拖动：显式 slider 角色，支持鼠标点击和方向键
  return (
    <div
      className={cn('relative w-full cursor-pointer select-none', className)}
      style={{ height }}
      onClick={handleClick}
      onKeyDown={handleKey}
      role="slider"
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
    >
      {canvas}
      {fallback}
    </div>
  )
}
