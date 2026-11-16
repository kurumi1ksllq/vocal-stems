// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { streamLogs } from '@renderer/lib/api'
import { cn } from '@vs/ui/lib/utils'
import { useEffect, useRef, useState } from 'react'

const TAG_RE = /^\s*\[(\d\/\d|失败|.+?)\]/

interface Line {
  id: number
  text: string
}

/**
 * 实时日志。走 IPC 推送而不是轮询：推理要跑 1–3 分钟，
 * 轮询会把整段日志反复传一遍。
 *
 * 这里唯一明确用等宽字体的地方——它是机器输出，不是界面文字。
 */
export function LogStream({
  jobId,
  active,
  seed,
  className,
  maxHeight = 200,
}: {
  jobId: string
  /** 任务已结束就不用再订阅 */
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

  // 换任务时把状态整体重置
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: 用 lines 作为触发信号，body 里只操作 DOM ref
  useEffect(() => {
    const el = boxRef.current
    if (!el || !stickBottom.current) return
    el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div className={cn('well overflow-hidden rounded-[14px]', className)}>
      <div className="text-muted-foreground flex items-center gap-2 border-b border-white/7 px-3 py-1.5 text-caption2">
        <span>运行日志</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span
            className={cn('size-1.5 rounded-full', done ? 'bg-muted-foreground/40' : 'bg-signal')}
            aria-hidden
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
        className="overflow-y-auto px-3 py-2 font-mono text-caption2 leading-relaxed"
      >
        {lines.length === 0 ? (
          <p className="text-muted-foreground/50">等待输出…</p>
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
        'break-words whitespace-pre-wrap',
        isFail
          ? 'text-destructive'
          : isDone
            ? 'text-[#30d158]'
            : m
              ? 'text-foreground/85'
              : 'text-muted-foreground',
      )}
    >
      {text}
    </div>
  )
}
