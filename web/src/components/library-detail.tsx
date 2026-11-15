import { AlertCircle, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { StemGrid } from '@/components/stem-grid'
import { api, type ResultDir } from '@/lib/api'

/** 历史产物的详情：直接把目录扫成可播放的轨。 */
export function LibraryDetail({ dir }: { dir: string }) {
  const [result, setResult] = useState<ResultDir | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const token = useRef(0)

  useEffect(() => {
    if (!dir) return
    const mine = ++token.current
    setLoading(true)
    setError(null)
    api
      .libraryResult(dir)
      .then((r) => {
        if (mine === token.current) setResult(r)
      })
      .catch((e: unknown) => {
        if (mine === token.current) {
          setError(e instanceof Error ? e.message : '读取失败')
          setResult(null)
        }
      })
      .finally(() => {
        if (mine === token.current) setLoading(false)
      })
  }, [dir])

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10 text-[12.5px]">
        <Loader2 className="size-3.5 animate-spin" />
        读取产物…
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10 text-[12.5px]">
        <AlertCircle className="size-3.5" />
        {error}
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] font-medium">{result.name}</p>
        <p
          className="text-muted-foreground mt-0.5 truncate font-mono text-[10.5px]"
          title={result.dir}
        >
          {result.dir}
        </p>
      </div>
      <StemGrid result={result} />
    </div>
  )
}
