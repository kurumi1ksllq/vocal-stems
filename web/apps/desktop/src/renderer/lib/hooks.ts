import { api, type Health, type Job, type LibraryEntry, type WeightEntry } from '@renderer/lib/api'
import { useCallback, useEffect, useRef, useState } from 'react'

/** 探活 + 权重清单，进页面时加载一次，可手动刷新。 */
export function useHealth() {
  const [health, setHealth] = useState<Health | null>(null)
  const [weights, setWeights] = useState<WeightEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [h, w] = await Promise.all([api.health(), api.weights()])
      setHealth(h)
      setWeights(w)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '后端未响应')
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { health, weights, error, loading, refresh }
}

/**
 * 任务轮询：只轮询未完成的任务，全部结束后停表。
 * 日志走 SSE 单独订阅，这里只管状态。
 */
export function useJobs(pollMs = 2000) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = await api.jobs()
      setJobs(list)
      setError(null)
      return list
    } catch (e) {
      setError(e instanceof Error ? e.message : '任务列表获取失败')
      return []
    }
  }, [])

  useEffect(() => {
    let alive = true
    const tick = async () => {
      const list = await refresh()
      if (!alive) return
      const pending = list.some((j) => j.status === 'running' || j.status === 'queued')
      timer.current = window.setTimeout(tick, pending ? 1200 : pollMs)
    }
    void tick()
    return () => {
      alive = false
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [refresh, pollMs])

  return { jobs, error, refresh }
}

/** 历史产物列表 */
export function useLibrary() {
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await api.library())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取历史失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { entries, error, loading, refresh }
}
