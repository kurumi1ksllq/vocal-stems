import { ArrowRight, Cpu, GitBranch, Layers, Mic2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const PIPELINE = [
  {
    step: '01',
    name: '去伴奏',
    script: 'svc_stems.py',
    models: ['KJ mel_band_roformer', 'gabox vocals'],
    out: ['人声（含和声）', '伴奏'],
    color: 'text-stem-vocal',
  },
  {
    step: '02',
    name: '去和声',
    script: 'svc_karaoke.py',
    models: ['anvuew BS-RoFormer', 'gabox Mel-Band RoFormer'],
    out: ['纯主唱', '和声'],
    color: 'text-stem-backing',
  },
  {
    step: '03',
    name: '去混响',
    script: 'svc_dereverb.py',
    models: ['anvuew dereverb'],
    out: ['干声', '混响成分'],
    color: 'text-stem-inst',
  },
]

const DESIGN_NOTES = [
  {
    icon: Layers,
    title: '融合算法',
    body: '旧的 median_fft 直接对复数取中位——np.median 按实部排序而非模，偶数模型时会把幅度腰斩。新算法把幅度和相位拆开：幅度取统计量，相位取最响那一路。16k–20k 频段能量保持率 0.851 → 0.963。',
  },
  {
    icon: Cpu,
    title: 'fp16 权重 ≠ fp16 计算',
    body: '5 个权重共 1.5GB，存 fp16 只为省磁盘。加载后强制 model.float()，计算全程 fp32，所以老卡也能跑，实测 SNR 61~70 dB。',
  },
  {
    icon: GitBranch,
    title: '跨架构互补',
    body: '去和声从 4 模型砍到 2：anvuew（BS-RoFormer）+ gabox（Mel-Band RoFormer）。同架构模型犯同样的错，融合补不上；becruily+anvuew 差异高达 10.09%。',
  },
]

export function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="space-y-2">
        <h1 className="text-[22px] font-semibold tracking-tight">干声分离台</h1>
        <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
          基于 ZFTurbo/MSST 的本地改造版。上游提供训练与推理框架，本仓库追加三条分离脚本
          ——去伴奏、去和声、去混响——并针对 RTX 3070 8GB 做过模型裁剪。
          这个页面是它们的前端：拖入音频，选模式，听结果。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic2 className="text-primary size-4" />
            流水线
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {PIPELINE.map((p, i) => (
            <div key={p.step}>
              <div className="flex items-start gap-3 py-3">
                <span className={`font-mono text-[11px] tabular-nums ${p.color}`}>{p.step}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{p.name}</span>
                    <code className="text-muted-foreground/70 font-mono text-[10.5px]">
                      {p.script}
                    </code>
                    <ArrowRight className="text-muted-foreground/30 size-3" />
                    {p.out.map((o) => (
                      <Badge key={o} variant="teal" className="text-[10px]">
                        {o}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-muted-foreground/70 mt-1 font-mono text-[10.5px]">
                    {p.models.join(' + ')}
                  </p>
                </div>
              </div>
              {i < PIPELINE.length - 1 && <Separator />}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {DESIGN_NOTES.map((n) => (
          <Card key={n.title} className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-1.5 text-[12.5px]">
                <n.icon className="text-muted-foreground size-3.5" />
                {n.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <p className="text-muted-foreground text-[11px] leading-relaxed">{n.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="gap-3 py-4">
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4">
          <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            <Sparkles className="size-3" />
            技术栈
          </span>
          {['React 19', 'TypeScript', 'Vite', 'Tailwind v4', 'shadcn/ui', 'FastAPI'].map((t) => (
            <span key={t} className="text-muted-foreground/70 font-mono text-[10.5px]">
              {t}
            </span>
          ))}
        </CardContent>
      </Card>

      <p className="text-muted-foreground/50 pb-4 text-center text-[10.5px]">
        原创部分 PolyForm Strict 1.0.0 · 上游派生部分 MIT
      </p>
    </div>
  )
}
