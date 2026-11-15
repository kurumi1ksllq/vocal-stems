import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Waveform } from '@/components/waveform'
import { formatDuration } from '@/lib/utils'

interface StemPlayerProps {
  url: string
  label: string
  color: string
  /** 当前唯一在响的 URL，由父组件统一管理，保证同一时刻只有一条轨出声 */
  playingUrl: string | null
  onPlayUrl: (url: string | null) => void
}

/**
 * 单轨播放器（受控）。
 * 只有 playingUrl === url 时才出声，其余轨自动暂停并保留进度。
 */
export function StemPlayer({ url, label, color, playingUrl, onPlayUrl }: StemPlayerProps) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mine = playingUrl === url

  // 被别人抢走播放权时暂停自己
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!mine && !el.paused) el.pause()
  }, [mine])

  const progress = duration > 0 ? current / duration : 0

  const toggle = async () => {
    const el = ref.current
    if (!el) return
    if (mine) {
      el.pause()
      onPlayUrl(null)
      return
    }
    try {
      await el.play()
      setError(null)
      onPlayUrl(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : '播放失败')
    }
  }

  const seek = (ratio: number) => {
    const el = ref.current
    if (!el || !duration) return
    el.currentTime = Math.max(0, Math.min(1, ratio)) * duration
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3 transition-colors hover:border-border/90">
      {/* 这是纯音频播放，没有画面，不需要字幕轨 */}
      {/* biome-ignore lint/a11y/useMediaCaption: 干声分离产物没有可配的语音轨字幕 */}
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onTimeUpdate={() => setCurrent(ref.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          const d = ref.current?.duration ?? 0
          setDuration(Number.isFinite(d) ? d : 0)
        }}
        onEnded={() => {
          if (mine) onPlayUrl(null)
        }}
        className="hidden"
      />

      <div className="flex items-center gap-3">
        <Button
          size="icon-sm"
          variant={mine ? 'default' : 'secondary'}
          onClick={() => void toggle()}
          aria-label={mine ? `暂停 ${label}` : `播放 ${label}`}
          className="shrink-0"
        >
          {mine ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </Button>

        <div className="min-w-0 flex-1">
          <Waveform
            url={url}
            progress={progress}
            color={color}
            height={40}
            bins={120}
            onSeek={seek}
          />
        </div>

        <span className="text-muted-foreground w-24 shrink-0 text-right font-mono text-[11px] tabular-nums">
          {formatDuration(current)} / {formatDuration(duration)}
        </span>
      </div>

      {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
