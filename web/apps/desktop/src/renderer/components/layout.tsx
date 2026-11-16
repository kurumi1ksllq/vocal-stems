// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { Toaster } from '@renderer/components/toaster'
import { cn } from '@vs/ui/lib/utils'
import { FolderClock, Mic2, Music4 } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'

const NAV = [
  { to: '/', label: '分离台', icon: Music4, end: true },
  { to: '/library', label: '产物库', icon: FolderClock },
]

/**
 * 外壳。
 *
 * iOS 的结构不是"顶栏 + 内容"，是「大标题 + 悬浮层」：
 *   · 顶部是一块玻璃导航条，标题居中，动作按钮在右边
 *   · 内容在那块玻璃下面滚动，玻璃负责模糊掉滚过去的东西
 *   · 底部是浮起的胶囊标签栏（iPad / macOS 版 iOS 的做法）
 *
 * 这里照这个结构做：顶部玻璃导航 + 大标题、内容滚动区、底部胶囊 tab bar。
 */
export function Layout() {
  return (
    <div className="flex min-h-full flex-col">
      {/* 顶部玻璃导航条 */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-black/25 backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex h-12 w-full max-w-[1120px] items-center gap-3 px-5">
          <span className="flex items-center gap-2">
            <Mic2 className="text-tint size-4" />
            <span className="font-display text-caption font-semibold tracking-tight">
              干声分离台
            </span>
          </span>

          <span className="text-muted-foreground/50 ml-1 text-caption2">本机 GPU</span>

          <span className="readout text-muted-foreground/45 ml-auto">分离输出/ · 1.5 GB 权重</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-7 pb-28">
        <Outlet />
      </main>

      {/* 底部悬浮胶囊标签栏 */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-6">
        <div className="glass-thick pointer-events-auto flex items-center gap-1 rounded-full border border-white/12 p-1.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'pressable flex items-center gap-2 rounded-full px-4 py-1.5 text-caption font-medium transition-colors',
                  isActive
                    ? 'bg-white/18 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <n.icon className="size-3.5" />
              {n.label}
            </NavLink>
          ))}

          <NavLink
            to="/about"
            className={({ isActive }) =>
              cn(
                'pressable flex size-8 items-center justify-center rounded-full transition-colors',
                isActive
                  ? 'bg-white/18 text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )
            }
            aria-label="关于"
          >
            <span className="font-display text-caption font-semibold">i</span>
          </NavLink>
        </div>
      </nav>

      <Toaster />
    </div>
  )
}
