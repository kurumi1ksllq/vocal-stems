// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { StemGrid } from '@renderer/components/stem-grid'
import { api, type ResultDir } from '@renderer/lib/api'
import { useEffect, useRef, useState } from 'react'

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

  if (loading) return <p className="text-muted-foreground px-1 py-4 text-caption">读取产物…</p>
  if (error) return <p className="text-muted-foreground px-1 py-4 text-caption">{error}</p>
  if (!result) return null

  return (
    <div>
      <div className="mb-3 px-1">
        <p className="text-subhead leading-snug font-semibold">{result.name}</p>
        <p
          className="text-muted-foreground/60 mt-0.5 truncate font-mono text-caption2"
          title={result.dir}
        >
          {result.dir}
        </p>
      </div>
      <StemGrid result={result} />
    </div>
  )
}
