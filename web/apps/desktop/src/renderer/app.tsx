// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
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
      <div className="flex h-full flex-col items-start justify-center gap-2 p-10">
        <p className="panel-label">出错了</p>
        <p className="text-base">界面崩在渲染阶段，任务不受影响。</p>
        <pre className="border-border text-muted-foreground mt-1 max-w-xl overflow-auto border px-2.5 py-2 font-mono text-2xs">
          {error.message}
        </pre>
        <p className="text-muted-foreground/70 text-2xs">这条错误已经写进日志。</p>
        <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
          重新加载
        </Button>
      </div>
    )
  }
}
