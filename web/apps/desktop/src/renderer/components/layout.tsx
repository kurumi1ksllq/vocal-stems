import { Toaster } from '@renderer/components/toaster'
import { cn } from '@vs/ui/lib/utils'
import { FolderClock, Languages, Mic2, Music4, Sparkles } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'

const NAV = [
  { to: '/', label: '分离台', icon: Music4, end: true },
  { to: '/library', label: '产物库', icon: FolderClock },
  { to: '/about', label: '关于', icon: Sparkles },
]

export function Layout() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-border/60 bg-background/70 sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <div className="flex items-center gap-2">
            <div className="bg-primary/12 text-primary flex size-8 items-center justify-center rounded-lg">
              <Mic2 className="size-4" />
            </div>
            <div className="leading-tight">
              <p className="text-[13.5px] font-semibold tracking-tight">干声分离台</p>
              <p className="text-muted-foreground font-mono text-[10px]">vocal-stems</p>
            </div>
          </div>

          <nav className="ml-4 flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors',
                    isActive
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                  )
                }
              >
                <n.icon className="size-3.5" />
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-muted-foreground hidden font-mono text-[10.5px] sm:inline">
              RTX 3070 · fp32 推理
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
        <Outlet />
      </main>

      <footer className="border-border/50 mt-6 border-t">
        <div className="text-muted-foreground/60 mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[10.5px]">
          <span>干声分离三件套 · 本地 GPU 运行</span>
          <span className="opacity-40">|</span>
          <span className="font-mono">去伴奏 → 去和声 → 去混响</span>
          <span className="ml-auto flex items-center gap-1">
            <Languages className="size-3" />
            输出目录 分离输出/
          </span>
        </div>
      </footer>

      <Toaster />
    </div>
  )
}
