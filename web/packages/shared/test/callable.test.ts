// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
/**
 * Hono 路由测试：直接 app.request()，不需要 Electron 也不需要数据库。
 *
 * 用假的 SidecarApi 实现，验证的是「路由契约」而不是业务。
 */

import { type AppDeps, createApp } from '@vs/shared/callable'
import type { HealthInfo, JobView, SidecarApi } from '@vs/shared/sidecar-contract'
import { describe, expect, it, vi } from 'vitest'

const HEALTH: HealthInfo = {
  ok: true,
  root: '/repo',
  python: '/repo/.venv/python.exe',
  cuda: { available: true, device: 'RTX 3070' },
  cpuFallback: false,
  ffmpeg: { path: '/repo/bin/ffmpeg.exe', exists: true },
  weights: ['a.ckpt'],
  outRoot: '/out',
  modelsDir: '/repo/models',
  version: '45.3.2',
}

function makeJob(over: Partial<JobView> = {}): JobView {
  return {
    id: 'abc123',
    mode: 'dereverb',
    source: 'vocals',
    filename: 'x.wav',
    status: 'queued',
    outDir: null,
    exitCode: null,
    error: null,
    createdAt: 1,
    startedAt: null,
    finishedAt: null,
    elapsed: 0,
    ...over,
  }
}

/** 每个用例自己决定哪些方法被调用。 */
function makeSidecar(over: Partial<SidecarApi> = {}): SidecarApi {
  const base: SidecarApi = {
    probe: vi.fn(async () => HEALTH),
    createJob: vi.fn(async () => makeJob()),
    listJobs: vi.fn(async () => []),
    getJob: vi.fn(async () => null),
    cancelJob: vi.fn(async () => false),
    deleteJob: vi.fn(async () => undefined),
    getLogs: vi.fn(async () => []),
    getResult: vi.fn(async () => null),
    saveUpload: vi.fn(async (name) => ({ name, path: `/uploads/${name}`, size: 1 })),
    listLibrary: vi.fn(async () => []),
    readOutDir: vi.fn(async () => null),
    listWeights: vi.fn(async () => []),
    reveal: vi.fn(async () => false),
  }
  return { ...base, ...over }
}

function build(sidecar: SidecarApi) {
  const deps: AppDeps = {
    // 路由不直接碰 db，传个占位
    db: {} as AppDeps['db'],
    sidecar,
    now: () => 1000,
    outRoot: '/out',
  }
  return createApp(deps)
}

const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('GET /health', () => {
  it('200 并返回探测结果', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('GET', '/health'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, cuda: { available: true } })
  })
})

describe('GET /jobs', () => {
  it('默认 limit=50', async () => {
    const listJobs = vi.fn(async () => [])
    const app = build(makeSidecar({ listJobs }))
    await app.request(req('GET', '/jobs'))
    expect(listJobs).toHaveBeenCalledWith(50)
  })

  it('显式 limit 传下去', async () => {
    const listJobs = vi.fn(async () => [])
    const app = build(makeSidecar({ listJobs }))
    await app.request(req('GET', '/jobs?limit=5'))
    expect(listJobs).toHaveBeenCalledWith(5)
  })

  it('非法 limit 回退 50', async () => {
    const listJobs = vi.fn(async () => [])
    const app = build(makeSidecar({ listJobs }))
    await app.request(req('GET', '/jobs?limit=abc'))
    expect(listJobs).toHaveBeenCalledWith(50)
  })
})

describe('GET /jobs/:id', () => {
  it('存在时 200', async () => {
    const app = build(makeSidecar({ getJob: vi.fn(async () => makeJob()) }))
    const res = await app.request(req('GET', '/jobs/abc123'))
    expect(res.status).toBe(200)
  })

  it('不存在时 404', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('GET', '/jobs/none'))
    expect(res.status).toBe(404)
  })
})

describe('POST /jobs', () => {
  const valid = {
    mode: 'dereverb',
    source: 'vocals',
    filename: 'a.wav',
    inputName: 'deadbeef.wav',
    options: { bigshifts: 1, parallel: 2, noMp3: false, noEnsemble: false },
  }

  it('合法入参 202', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('POST', '/jobs', valid))
    expect(res.status).toBe(202)
  })

  it('未知 mode 400', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('POST', '/jobs', { ...valid, mode: 'nope' }))
    expect(res.status).toBe(400)
  })

  it('缺 filename 400', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('POST', '/jobs', { ...valid, filename: '' }))
    expect(res.status).toBe(400)
  })

  it('bigshifts 越界 400', async () => {
    const app = build(makeSidecar())
    const res = await app.request(
      req('POST', '/jobs', { ...valid, options: { ...valid.options, bigshifts: 99 } }),
    )
    expect(res.status).toBe(400)
  })

  it('sidecar 抛错转成 400 带 message', async () => {
    const createJob = vi.fn(async () => {
      throw new Error('输入音频不存在')
    })
    const app = build(makeSidecar({ createJob }))
    const res = await app.request(req('POST', '/jobs', valid))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ message: '输入音频不存在' })
  })

  it('把 now() 结果传给 sidecar', async () => {
    const createJob = vi.fn(async () => makeJob())
    const app = build(makeSidecar({ createJob }))
    await app.request(req('POST', '/jobs', valid))
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({ mode: 'dereverb' }), 1000)
  })
})

describe('POST /jobs/:id/cancel', () => {
  it('能取消 200', async () => {
    const app = build(makeSidecar({ cancelJob: vi.fn(async () => true) }))
    const res = await app.request(req('POST', '/jobs/abc/cancel'))
    expect(res.status).toBe(200)
  })

  it('已结束 409', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('POST', '/jobs/abc/cancel'))
    expect(res.status).toBe(409)
  })
})

describe('DELETE /jobs/:id', () => {
  it('总是 200', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('DELETE', '/jobs/abc'))
    expect(res.status).toBe(200)
  })
})

describe('POST /upload', () => {
  it('合法 201', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('POST', '/upload', { name: 'a.wav', data: [1, 2, 3] }))
    expect(res.status).toBe(201)
  })

  it('缺 data 400', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('POST', '/upload', { name: 'a.wav' }))
    expect(res.status).toBe(400)
  })

  it('sidecar 拒绝格式时 400', async () => {
    const saveUpload = vi.fn(async () => {
      throw new Error('不支持的音频格式: .txt')
    })
    const app = build(makeSidecar({ saveUpload }))
    const res = await app.request(req('POST', '/upload', { name: 'a.txt', data: [1] }))
    expect(res.status).toBe(400)
  })
})

describe('GET /library/result', () => {
  it('缺 dir 400', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('GET', '/library/result'))
    expect(res.status).toBe(400)
  })

  it('目录不存在 404', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('GET', '/library/result?dir=/nope'))
    expect(res.status).toBe(404)
  })

  it('存在时 200', async () => {
    const readOutDir = vi.fn(async () => ({
      dir: '/out/x',
      name: 'x',
      mtime: 1,
      stems: [],
    }))
    const app = build(makeSidecar({ readOutDir }))
    const res = await app.request(req('GET', '/library/result?dir=/out/x'))
    expect(res.status).toBe(200)
  })
})

describe('GET /jobs/:id/result', () => {
  it('尚无产物 409', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('GET', '/jobs/abc/result'))
    expect(res.status).toBe(409)
  })
})

describe('POST /reveal', () => {
  it('越界 403', async () => {
    const app = build(makeSidecar())
    const res = await app.request(req('POST', '/reveal', { path: '/etc/passwd' }))
    expect(res.status).toBe(403)
  })

  it('允许 200', async () => {
    const app = build(makeSidecar({ reveal: vi.fn(async () => true) }))
    const res = await app.request(req('POST', '/reveal', { path: '/out/x' }))
    expect(res.status).toBe(200)
  })
})
