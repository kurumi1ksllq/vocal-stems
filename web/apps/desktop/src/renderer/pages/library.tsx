import { LibraryDetail } from '@renderer/components/library-detail'
import { useLibrary } from '@renderer/lib/hooks'
import { Badge } from '@vs/ui/components/badge'
import { Button } from '@vs/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@vs/ui/components/card'
import { cn, formatBytes, formatRelative } from '@vs/ui/lib/utils'
import { FolderClock, RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

/**
 * 产物库：直接扫 分离输出/ 的目录树。
 * 和任务列表不同，这里不依赖内存状态，重启后端也还在。
 */
export function LibraryPage() {
  const { entries, error, loading, refresh } = useLibrary()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return entries
    return entries.filter((e) => e.name.toLowerCase().includes(kw))
  }, [entries, q])

  const current = selected ?? filtered[0]?.dir ?? null

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderClock className="text-primary size-4" />
            产物库
            <Badge variant="secondary">{entries.length}</Badge>
            <Button
              size="icon-sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => void refresh()}
              title="重新扫描 分离输出/"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="按目录名筛选"
              className="border-border/70 bg-background/60 placeholder:text-muted-foreground/60 focus:border-primary/50 h-8 w-full rounded-md border pr-2.5 pl-8 text-[12px] outline-none transition-colors"
            />
          </div>

          {error && <p className="text-destructive text-[11.5px]">{error}</p>}

          <div className="max-h-[calc(100vh-260px)] space-y-0.5 overflow-y-auto pr-0.5">
            {filtered.length === 0 && !loading && (
              <p className="text-muted-foreground py-6 text-center text-[11.5px]">
                没有匹配的产物目录
              </p>
            )}
            {filtered.map((e) => (
              <button
                key={e.dir}
                type="button"
                onClick={() => setSelected(e.dir)}
                className={cn(
                  'w-full rounded-md px-2 py-1.5 text-left transition-colors',
                  current === e.dir ? 'bg-secondary/80' : 'hover:bg-secondary/45',
                )}
              >
                <p className="truncate text-[12px]" title={e.name}>
                  {e.name}
                </p>
                <p className="text-muted-foreground/70 mt-0.5 flex items-center gap-1.5 text-[10px]">
                  <span>{formatRelative(e.mtime)}</span>
                  <span className="opacity-50">·</span>
                  <span>{e.count} 轨</span>
                  <span className="opacity-50">·</span>
                  <span className="font-mono">{formatBytes(e.size)}</span>
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-1">
          {current ? (
            <LibraryDetail key={current} dir={current} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <FolderClock className="text-muted-foreground/40 size-6" />
              <p className="text-muted-foreground text-[12.5px]">分离输出/ 里还没有可播放的产物</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
