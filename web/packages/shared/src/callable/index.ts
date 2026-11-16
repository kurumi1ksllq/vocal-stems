// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
/**
 * Hono RPC 契约 —— 主进程实现，渲染进程用 `hc<CallableType>` 调用。
 *
 * 这里同时是：
 *   1. 运行时真实的路由实现（主进程 mount 它）
 *   2. 类型来源（渲染进程只 import type，构建时被擦除）
 *
 * 之所以放在 shared 而不是主进程：类型必须两端共享，
 * 否则渲染进程只能手写 IPC 通道映射，正是 spec 要避免的事。
 */
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppDb } from '../db/index.ts'
import type { SidecarApi } from '../sidecar-contract.ts'

/** 主进程注入的依赖。渲染进程永远不会构造它。 */
export interface AppDeps {
  db: AppDb
  sidecar: SidecarApi
  /** 毫秒时间戳，测试可替换 */
  now: () => number
  /** 产物根目录（绝对路径） */
  outRoot: string
}

const ModeEnum = z.enum(['stems', 'karaoke', 'dereverb'])
const SourceEnum = z.enum(['mix', 'vocals', 'karaoke'])

const CreateJobBody = z.object({
  mode: ModeEnum,
  source: SourceEnum,
  filename: z.string().min(1),
  /** 输入音频在上传目录里的文件名（由 /upload 返回） */
  inputName: z.string().min(1),
  options: z
    .object({
      bigshifts: z.number().int().min(1).max(4).default(1),
      parallel: z.number().int().min(1).max(4).default(2),
      fuse: z.string().optional(),
      noMp3: z.boolean().default(false),
      noEnsemble: z.boolean().default(false),
    })
    .default({ bigshifts: 1, parallel: 2, noMp3: false, noEnsemble: false }),
})

export type CreateJobInput = z.infer<typeof CreateJobBody>

export function createApp(deps: AppDeps) {
  const app = new Hono()
    .basePath('/api')

    // ---------------------------------------------------------------- health
    .get('/health', async (c) => {
      const env = await deps.sidecar.probe()
      return c.json(env)
    })

    // ---------------------------------------------------------------- jobs
    .get('/jobs', async (c) => {
      const limit = Number(c.req.query('limit') ?? '50')
      return c.json(await deps.sidecar.listJobs(Number.isFinite(limit) ? limit : 50))
    })

    .get('/jobs/:id', async (c) => {
      const job = await deps.sidecar.getJob(c.req.param('id'))
      if (!job) return c.json({ message: '任务不存在' }, 404)
      return c.json(job)
    })

    .post('/jobs', async (c) => {
      const parsed = CreateJobBody.safeParse(await c.req.json())
      if (!parsed.success) {
        return c.json({ message: '参数不合法', issues: parsed.error.issues }, 400)
      }
      try {
        return c.json(await deps.sidecar.createJob(parsed.data, deps.now()), 202)
      } catch (err) {
        return c.json({ message: errText(err) }, 400)
      }
    })

    .post('/jobs/:id/cancel', async (c) => {
      const ok = await deps.sidecar.cancelJob(c.req.param('id'))
      if (!ok) return c.json({ message: '任务已结束或不存在' }, 409)
      return c.json({ ok: true })
    })

    .delete('/jobs/:id', async (c) => {
      await deps.sidecar.deleteJob(c.req.param('id'))
      return c.json({ ok: true })
    })

    .get('/jobs/:id/logs', async (c) => {
      const lines = await deps.sidecar.getLogs(c.req.param('id'))
      return c.json({ lines })
    })

    .get('/jobs/:id/result', async (c) => {
      const result = await deps.sidecar.getResult(c.req.param('id'))
      // 两种都落到这里：任务还没产物目录，或目录已被移走/清理（E2E 跑在临时目录时常见）
      if (!result) return c.json({ message: '产物目录已不在了（可能被移动或清理过）' }, 409)
      return c.json(result)
    })

    // ---------------------------------------------------------------- upload
    /**
     * 上传不走 multipart —— 渲染进程已经通过 <input type=file> 拿到了 File，
     * 直接把它读成 ArrayBuffer 传进来，主进程落盘。这样只有一次拷贝。
     */
    .post('/upload', async (c) => {
      const body = await c.req.json<{ name: string; data: number[] }>()
      if (!body?.name || !Array.isArray(body.data)) {
        return c.json({ message: '缺少 name 或 data' }, 400)
      }
      try {
        const saved = await deps.sidecar.saveUpload(body.name, new Uint8Array(body.data))
        return c.json(saved, 201)
      } catch (err) {
        return c.json({ message: errText(err) }, 400)
      }
    })

    // ---------------------------------------------------------------- library
    .get('/library', async (c) => c.json(await deps.sidecar.listLibrary()))

    .get('/library/result', async (c) => {
      const dir = c.req.query('dir')
      if (!dir) return c.json({ message: '缺少 dir' }, 400)
      const result = await deps.sidecar.readOutDir(dir)
      if (!result) return c.json({ message: '目录不存在或越界' }, 404)
      return c.json(result)
    })

    // ---------------------------------------------------------------- models
    .get('/weights', async (c) => c.json(await deps.sidecar.listWeights()))

    // ---------------------------------------------------------------- reveal
    .post('/reveal', async (c) => {
      const { path } = await c.req.json<{ path: string }>()
      const ok = await deps.sidecar.reveal(path)
      if (!ok) return c.json({ message: '只能打开产物目录' }, 403)
      return c.json({ ok: true })
    })

  return app
}

/** `hc<CallableType>` 需要的是 app 实例的类型，不是工厂类型。 */
export type CallableType = ReturnType<typeof createApp>

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
