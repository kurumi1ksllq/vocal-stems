import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import { ToasterProvider } from './components/toaster.tsx'
import './i18n.ts'
import './styles.css'

/** 本地 IPC 没有网络抖动，staleTime 可以放心给 60s。 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('找不到 #root 挂载点')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToasterProvider>
        <App />
      </ToasterProvider>
    </QueryClientProvider>
  </StrictMode>,
)
