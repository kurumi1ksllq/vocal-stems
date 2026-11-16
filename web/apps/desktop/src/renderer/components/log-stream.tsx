import { streamLogs } from '@renderer/lib/api'
import { cn } from '@vs/ui/lib/utils'
import { TerminalSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const TAG_RE = /^\s*\[(\d\/\d|失败|.+?)\]/

interface Line {
  id: number
  text: string
}

/**
 * 实时日志。用 SSE 而不是轮询：推理要跑 1–3 分钟，
 * 轮询会把整段日志反复传一遍。
 */
export function LogStream({
  jobId,
  active,
  seed,
  className,
  maxHeight = 260,
}: {
  jobId: string
  /** 任务已结束就不用再连 SSE */
  active: boolean
  seed?: string[]
  className?: string
  maxHeight?: number
}) {
  const [lines, setLines] = useState<Line[]>([])
  const [done, setDone] = useState(!active)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const stickBottom = useRef(true)
  const nextId = useRef(0)

  // 换任务时把状态整体重置。用 key={jobId} 交给父组件重挂载也能达到同样效果，
  // 但这里自己处理，调用方不用关心。
  const [boundJob, setBoundJob] = useState(jobId)
  if (boundJob !== jobId) {
    setBoundJob(jobId)
    setLines([])
    setDone(!active)
    nextId.current = 0
  }

  // 首屏把调用方传入的历史行灌进去
  useEffect(() => {
    if (!seed || seed.length === 0) return
    setLines(seed.map((text) => ({ id: nextId.current++, text })))
  }, [seed])

  useEffect(() => {
    if (!active) {
      setDone(true)
      return
    }
    setDone(false)
    return streamLogs(jobId, {
      onLine: (text) => {
        const id = nextId.current++
        setLines((prev) => [...prev, { id, text }])
      },
      onEnd: () => setDone(true),
    })
  }, [jobId, active])

  // 只在用户本来就贴着底部时才自动滚动，避免打断向上翻看。
  // 依赖 lines 是为了「有新行就滚」，effect 内部只碰 ref 属于预期用法。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 用 lines 作为触发信号，body 里只操作 DOM ref
  useEffect(() => {
    const el = boxRef.current
    if (!el || !stickBottom.current) return
    el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div className={cn('rounded-lg border border-border/70 bg-background/60', className)}>
      <div className="text-muted-foreground flex items-center gap-2 border-b border-border/60 px-3 py-2 text-[11px]">
        <TerminalSquare className="size-3.5" />
        <span>运行日志</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span
            className={cn(
              'size-1.5 rounded-full',
              done ? 'bg-muted-foreground/50' : 'bg-amber-400 animate-pulse',
            )}
          />
          {done ? '已结束' : '实时'}
        </span>
      </div>
      <div
        ref={boxRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
        style={{ maxHeight }}
        className="overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed"
      >
        {lines.length === 0 ? (
          <p className="text-muted-foreground/70">等待输出…</p>
        ) : (
          lines.map((line) => <LogLine key={line.id} text={line.text} />)
        )}
      </div>
    </div>
  )
}

function LogLine({ text }: { text: string }) {
  const m = TAG_RE.exec(text)
  const isFail = text.includes('[失败]') || /error|traceback|exception/i.test(text)
  const isDone = text.startsWith('完成 →') || text.includes(' 完成')

  return (
    <div
      className={cn(
        'whitespace-pre-wrap break-words',
        isFail
          ? 'text-red-400'
          : isDone
            ? 'text-emerald-400'
            : m
              ? 'text-foreground/90'
              : 'text-muted-foreground',
      )}
    >
      {text}
    </div>
  )
}
