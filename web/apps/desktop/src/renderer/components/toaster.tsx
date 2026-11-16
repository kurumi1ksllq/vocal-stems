// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { cn } from '@vs/ui/lib/utils'
import { X } from 'lucide-react'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

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

/**
 * Toast。iOS 的提示是从底部升起的厚玻璃胶囊，不是带边框的小卡片。
 */
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
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className="glass-thick sheet-up pointer-events-auto flex w-full max-w-[360px] items-start gap-2.5 rounded-[18px] border border-white/14 px-4 py-3"
          >
            <span
              className={cn(
                'mt-1.5 size-2 shrink-0 rounded-full',
                t.kind === 'success'
                  ? 'bg-[#30d158]'
                  : t.kind === 'error'
                    ? 'bg-destructive'
                    : 'bg-tint',
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-footnote leading-snug font-medium">{t.title}</p>
              {t.body && (
                <p className="text-muted-foreground mt-0.5 break-words text-caption">{t.body}</p>
              )}
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="关闭提示"
            >
              <X className="size-3.5" />
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
