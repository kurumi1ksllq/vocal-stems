/**
 * 应用根：HashRouter + ErrorBoundary。
 *
 * 用 createHashRouter 而不是 BrowserRouter：Electron 打包后页面来自
 * file://，history API 的路径无法映射到文件，刷新会 404。
 */

import { Layout } from '@renderer/components/layout'
import { AboutPage } from '@renderer/pages/about'
import { LibraryPage } from '@renderer/pages/library'
import { NotFoundPage } from '@renderer/pages/not-found'
import { StudioPage } from '@renderer/pages/studio'
import { Button } from '@vs/ui/components/button'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { createHashRouter, RouterProvider } from 'react-router'

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <StudioPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}

interface BoundaryState {
  error: Error | null
}

/**
 * 渲染进程错误必须经 preload 管道进 electron-log（spec 纪律），
 * 所以这里只调 window.vs.reportError，不 import 任何日志库。
 */
class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    window.vs?.reportError({
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      url: window.location.href,
    })
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[15px] font-medium text-destructive">出错了</p>
        <pre className="text-muted-foreground max-w-lg overflow-auto rounded-md border border-border/60 bg-background/60 p-3 text-left font-mono text-[11px]">
          {error.message}
        </pre>
        <p className="text-muted-foreground text-[11px]">错误已记录到日志</p>
        <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
          重新加载
        </Button>
      </div>
    )
  }
}
