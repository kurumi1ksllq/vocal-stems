import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ResultDir } from '@/lib/api'

/**
 * 拉取任务产物。
 * done 之后才拉；任务重跑时 enabled 变 false，自动清空。
 */
export function useJobResult(jobId: string | null, enabled: boolean) {
  const [result, setResult] = useState<ResultDir | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const token = useRef(0)

  const load = useCallback(async () => {
    if (!jobId || !enabled) {
      setResult(null)
      return
    }
    const mine = ++token.current
    setLoading(true)
    setError(null)
    try {
      const r = await api.jobResult(jobId)
      if (mine === token.current) setResult(r)
    } catch (e) {
      if (mine === token.current) {
        setError(e instanceof Error ? e.message : '读取产物失败')
        setResult(null)
      }
    } finally {
      if (mine === token.current) setLoading(false)
    }
  }, [jobId, enabled])

  useEffect(() => {
    void load()
  }, [load])

  return { result, loading, error, reload: load }
}
