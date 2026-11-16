// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { DropZone } from '@renderer/components/drop-zone'
import { ModePicker } from '@renderer/components/mode-picker'
import { OptionsPanel } from '@renderer/components/options-panel'
import type { Job, JobOptions, ModeKey, SourceKey } from '@renderer/lib/api'
import { api } from '@renderer/lib/api'
import { MODE_META, SOURCE_META } from '@renderer/lib/modes'
import { Button } from '@vs/ui/components/button'
import { useEffect, useState } from 'react'

const DEFAULT_OPTS: JobOptions = {
  bigshifts: 1,
  parallel: 2,
  fuse: '',
  noMp3: false,
  noEnsemble: false,
}

const LAST_KEY = 'vs:last-run'

interface LastRun {
  mode: ModeKey
  source: SourceKey
  opts: JobOptions
}

function readLast(): LastRun | null {
  try {
    const raw = localStorage.getItem(LAST_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LastRun
  } catch {
    return null
  }
}

/**
 * 发起任务。
 *
 * 顺序就是真实操作的顺序：放文件 → 说做什么 → 说拿什么当输入 → 开始。
 * 一块玻璃装下整条流程，每组之间用 iOS 的分隔线（左右内缩）分开。
 */
export function NewJobPanel({
  onCreated,
  healthOk,
  probing,
}: {
  onCreated: (job: Job) => void
  healthOk: boolean
  /** 环境首次探测还没回来。/health 要 spawn Python 跑 torch，冷启动要几秒 */
  probing: boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<ModeKey>('stems')
  const [source, setSource] = useState<SourceKey>('mix')
  const [opts, setOpts] = useState<JobOptions>(DEFAULT_OPTS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remembered, setRemembered] = useState<LastRun | null>(null)

  // 上次用的是哪套参数，方便重复跑同一批素材
  useEffect(() => {
    const last = readLast()
    if (last) setRemembered(last)
  }, [])

  const submit = async () => {
    if (!file || busy) return
    setBusy(true)
    setError(null)
    try {
      const job = await api.createJob(file, mode, source, opts)
      localStorage.setItem(LAST_KEY, JSON.stringify({ mode, source, opts } satisfies LastRun))
      setRemembered({ mode, source, opts })
      setFile(null)
      onCreated(job)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败')
    } finally {
      setBusy(false)
    }
  }

  const applyRemembered = () => {
    if (!remembered) return
    setMode(remembered.mode)
    setSource(remembered.source)
    setOpts(remembered.opts)
  }

  const canSubmit = !!file && !busy && healthOk

  return (
    <section>
      <div className="group-label mb-2 flex items-baseline gap-2 px-4">
        <span>新建分离</span>
        {remembered && (
          <button
            type="button"
            onClick={applyRemembered}
            className="text-tint ml-auto font-normal"
            title={`${MODE_META[remembered.mode].label} · ${SOURCE_META[remembered.source].label} · 并行 ${remembered.opts.parallel}`}
          >
            套用上次
          </button>
        )}
      </div>

      <div className="glass border-white/10 rounded-[24px] border">
        <div className="p-4">
          <DropZone file={file} onFile={setFile} disabled={busy} />
        </div>

        <div className="border-t border-white/8 p-4">
          <ModePicker
            mode={mode}
            source={source}
            disabled={busy}
            onChange={(m, s) => {
              setMode(m)
              setSource(s)
            }}
          />
        </div>

        <div className="border-t border-white/8 px-4">
          <OptionsPanel opts={opts} onChange={setOpts} disabled={busy} />
        </div>

        <div className="space-y-2 border-t border-white/8 p-4">
          {error && (
            <p className="bg-destructive/12 text-destructive rounded-[10px] px-3 py-2 text-caption">
              {error}
            </p>
          )}

          <Button className="w-full" size="lg" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? '正在提交…' : `开始${MODE_META[mode].label}`}
          </Button>
          <p className="text-muted-foreground/70 px-1 text-caption2">
            {probing
              ? '正在检测本机环境…'
              : healthOk
                ? source === 'mix' && mode !== 'stems'
                  ? '会先自动跑前置步骤，耗时叠加'
                  : `产出 ${MODE_META[mode].outputs}`
                : '环境未就绪，先看下面的环境检测'}
          </p>
        </div>
      </div>
    </section>
  )
}
