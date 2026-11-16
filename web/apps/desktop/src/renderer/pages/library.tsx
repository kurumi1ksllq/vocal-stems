// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { LibraryDetail } from '@renderer/components/library-detail'
import { useLibrary } from '@renderer/lib/hooks'
import { cn, formatBytes, formatRelative } from '@vs/ui/lib/utils'
import { useMemo, useState } from 'react'

/**
 * 产物库：直接扫 分离输出/ 的目录树。
 * 和任务列表不同，这里不依赖内存状态，重启应用也还在。
 *
 * 两列：左边 iOS 的分组列表（每行一个目录），右边是选中目录的产物。
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
    <div className="window-in">
      <div className="mb-6 px-1">
        <h1 className="text-title1">产物库</h1>
        <p className="text-muted-foreground mt-1.5 max-w-[52ch] text-footnote leading-relaxed">
          分离输出/ 里的每一条结果。重启应用也还在。
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <section>
          <div className="group-label mb-2 flex items-baseline gap-2 px-4">
            <span>{entries.length} 个目录</span>
            <button
              type="button"
              className="text-tint ml-auto font-normal"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? '扫描中…' : '重新扫描'}
            </button>
          </div>

          <div className="glass border-white/10 rounded-[18px] border p-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="按目录名筛选"
              aria-label="按目录名筛选"
              className="well placeholder:text-muted-foreground/50 focus:ring-tint/50 mb-3 h-8 w-full rounded-[10px] px-3 text-caption outline-none focus:ring-2"
            />

            {error && <p className="text-destructive px-1 pb-2 text-caption2">{error}</p>}

            <div className="max-h-[calc(100vh-300px)] space-y-1 overflow-y-auto">
              {filtered.length === 0 && !loading && (
                <p className="text-muted-foreground/60 px-1 py-4 text-caption">
                  {entries.length === 0 ? '分离输出/ 还是空的。' : '没有匹配的目录。'}
                </p>
              )}
              {filtered.map((e) => (
                <button
                  key={e.dir}
                  type="button"
                  onClick={() => setSelected(e.dir)}
                  aria-current={current === e.dir}
                  className={cn(
                    'pressable block w-full rounded-[12px] px-3 py-2 text-left transition-colors',
                    current === e.dir ? 'bg-white/14' : 'hover:bg-white/7',
                  )}
                >
                  <span className="block truncate text-footnote" title={e.name}>
                    {e.name}
                  </span>
                  <span className="readout text-muted-foreground/70 mt-0.5 flex items-center gap-2">
                    {formatRelative(e.mtime)}
                    <span className="opacity-40">·</span>
                    {e.count} 轨<span className="opacity-40">·</span>
                    {formatBytes(e.size)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="min-w-0">
          {current ? (
            <LibraryDetail key={current} dir={current} />
          ) : (
            <p className="text-muted-foreground/60 px-1 text-caption">
              左边选一个目录，或者先去分离台跑一首。
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
