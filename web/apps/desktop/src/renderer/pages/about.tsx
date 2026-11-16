// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { cn } from '@vs/ui/lib/utils'

const PIPELINE = [
  {
    name: '去伴奏',
    script: 'svc_stems.py',
    models: 'KJ mel_band_roformer + gabox vocals',
    out: '人声（含和声）、伴奏',
    color: 'var(--stem-vocal)',
    accepts: '整曲',
  },
  {
    name: '去和声',
    script: 'svc_karaoke.py',
    models: 'anvuew BS-RoFormer + gabox Mel-Band RoFormer',
    out: '纯主唱、和声',
    color: 'var(--stem-backing)',
    accepts: '人声轨 / 整曲',
  },
  {
    name: '去混响',
    script: 'svc_dereverb.py',
    models: 'anvuew dereverb',
    out: '干声、混响成分',
    color: 'var(--stem-inst)',
    accepts: '人声轨 / 主唱 / 整曲',
  },
]

const NOTES = [
  {
    title: '融合算法',
    body: 'np.median 作用在复数上按实部排序，偶数个模型取中间两个的均值会让幅度腰斩。新算法把幅度和相位拆开：幅度取统计量，相位取最响那一路。16k–20k 频段能量保持率 0.851 → 0.963。',
  },
  {
    title: 'fp16 权重，fp32 计算',
    body: '5 个权重共 1.5 GB，存 fp16 只为省磁盘。加载后强制 model.float()，计算全程 fp32，老卡也能跑，实测 SNR 61–70 dB。',
  },
  {
    title: '跨架构互补',
    body: '去和声从 4 个模型砍到 2 个：anvuew（BS-RoFormer）配 gabox（Mel-Band RoFormer）。同架构模型犯同样的错，融合补不上；becruily + anvuew 的差异高达 10.09%。',
  },
]

/**
 * 关于。做成 iOS 的「设置 → 关于本机」：
 * 顶部一个图标 + 名字 + 版本，然后几组 grouped list，每行一件事。
 */
export function AboutPage() {
  return (
    <div className="window-in mx-auto max-w-[720px]">
      {/* 顶部标识 */}
      <div className="mb-7 flex flex-col items-center gap-2.5 text-center">
        <span className="glass flex size-16 items-center justify-center rounded-[18px] border border-white/14">
          <span className="font-display text-title3 font-semibold tracking-tight">干</span>
        </span>
        <h1 className="text-title3">干声分离台</h1>
        <p className="text-muted-foreground text-caption">vocal-stems 0.3.0 · 本机 GPU</p>
      </div>

      <div className="space-y-6">
        <section>
          <div className="group-label mb-2 px-4">它是什么</div>
          <div className="glass border-white/10 rounded-[18px] border px-5 py-4">
            <p className="text-foreground/85 text-footnote leading-relaxed">
              基于 ZFTurbo/MSST 的本地改造版。上游提供训练与推理框架，这里追加三条分离脚本并按 RTX
              3070 8GB 做过模型裁剪。界面只做编排：拖入音频，选模式，听结果。
            </p>
          </div>
        </section>

        <section>
          <div className="group-label mb-2 px-4">三步流水线</div>
          <div className="glass border-white/10 overflow-hidden rounded-[18px] border">
            {PIPELINE.map((p, i) => (
              <div key={p.script} className={cn('px-5 py-3', i > 0 && 'border-t border-white/7')}>
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: p.color }}
                    aria-hidden
                  />
                  <span className="text-footnote font-medium">{p.name}</span>
                  <span className="text-muted-foreground/60 text-caption2">吃 {p.accepts}</span>
                  <span className="text-tint ml-auto font-mono text-caption2">{p.script}</span>
                </div>
                <p className="text-muted-foreground mt-1 pl-4 text-caption leading-relaxed">
                  {p.models}
                </p>
                <p className="text-muted-foreground/70 mt-0.5 pl-4 text-caption2">→ {p.out}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="group-label mb-2 px-4">设计取舍</div>
          <div className="glass border-white/10 overflow-hidden rounded-[18px] border">
            {NOTES.map((n, i) => (
              <div key={n.title} className={cn('px-5 py-3.5', i > 0 && 'border-t border-white/7')}>
                <p className="text-footnote font-medium">{n.title}</p>
                <p className="text-muted-foreground mt-1 text-caption leading-relaxed">{n.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="group-label mb-2 px-4">实现</div>
          <div className="glass border-white/10 rounded-[18px] border px-5 py-4">
            <p className="text-muted-foreground text-caption leading-relaxed">
              React 19 + Electron。渲染进程只经 preload 的 RPC 桥调主进程，主进程用 Hono
              路由把任务写进 SQLite，再把 PyTorch 放到 Python 子进程里跑。前端不实现任何分离逻辑。
            </p>
          </div>
        </section>

        <p className="text-muted-foreground/55 pb-2 text-center text-caption2">
          全仓库 PolyForm Strict 1.0.0 · 上游 MIT 代码仅作第三方归属
        </p>
      </div>
    </div>
  )
}
