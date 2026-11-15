import { CheckCircle2, TriangleAlert, X } from 'lucide-react'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
}

interface ToastApi {
  push: (kind: ToastKind, title: string, body?: string) => void
}

const Ctx = createContext<ToastApi | null>(null)

let seq = 0

export function ToasterProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const push = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = ++seq
    setItems((prev) => [...prev.slice(-3), { id, kind, title, body }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 5200)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[320px] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-fade-up pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-lg backdrop-blur-md',
              t.kind === 'success' && 'border-emerald-500/35 bg-emerald-950/85',
              t.kind === 'error' && 'border-red-500/35 bg-red-950/85',
              t.kind === 'info' && 'border-border bg-popover/95',
            )}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
            ) : t.kind === 'error' ? (
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-red-400" />
            ) : (
              <CheckCircle2 className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium">{t.title}</p>
              {t.body && (
                <p className="text-muted-foreground mt-0.5 break-words text-[11px]">{t.body}</p>
              )}
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="关闭提示"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast 必须在 ToasterProvider 内使用')
  return ctx
}

/** 兼容 Layout 里的 <Toaster />：真正的容器在 Provider 中 */
export function Toaster() {
  return null
}
