import { Music4, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DropZone } from '@/components/drop-zone'
import { ModePicker } from '@/components/mode-picker'
import { OptionsPanel } from '@/components/options-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { Job, JobOptions, ModeKey, SourceKey } from '@/lib/api'
import { api } from '@/lib/api'
import { MODE_META, SOURCE_META } from '@/lib/modes'

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

export function NewJobPanel({
  onCreated,
  healthOk,
}: {
  onCreated: (job: Job) => void
  healthOk: boolean
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music4 className="text-primary size-4" />
          新建分离
        </CardTitle>
        {remembered && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="text-muted-foreground/70 text-[10.5px]">
              上次：{MODE_META[remembered.mode].label} · {SOURCE_META[remembered.source].label} ·
              并行 {remembered.opts.parallel}
            </span>
            <button
              type="button"
              onClick={applyRemembered}
              className="text-muted-foreground hover:text-primary inline-flex items-center gap-0.5 text-[10.5px] transition-colors"
            >
              <RotateCcw className="size-2.5" />
              套用
            </button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <DropZone file={file} onFile={setFile} disabled={busy} />

        <Separator />

        <ModePicker
          mode={mode}
          source={source}
          disabled={busy}
          onChange={(m, s) => {
            setMode(m)
            setSource(s)
          }}
        />

        <OptionsPanel opts={opts} onChange={setOpts} disabled={busy} />

        {error && (
          <p className="text-destructive bg-destructive/8 rounded-md border border-destructive/30 px-2.5 py-2 text-[11.5px]">
            {error}
          </p>
        )}

        <div className="space-y-1.5">
          <Button className="w-full" size="lg" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? '提交中…' : `开始${MODE_META[mode].label}`}
          </Button>
          <p className="text-muted-foreground/60 text-center text-[10.5px]">
            {healthOk ? '推理在本机 GPU 上跑，关掉页面不影响任务' : '后端未连接，无法提交'}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-0.5">
          <Badge variant="outline" className="font-mono">
            {MODE_META[mode].outputs}
          </Badge>
          <Badge variant={opts.noEnsemble ? 'outline' : 'success'}>
            {opts.noEnsemble ? '不融合' : `融合 ${opts.fuse || 'mag_median_fft'}`}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
