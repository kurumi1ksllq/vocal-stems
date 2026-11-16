// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
/**
 * 完整回路 E2E：上传 → 建任务 → 等完成 → 读产物。
 *
 * 这条测试会真的跑一次 PyTorch 推理（5 秒素材，约 60–90 秒），
 * 所以标了 slow，默认不跟着快检跑。
 *
 * 跑法：VS_E2E_REAL_JOB=1 pnpm e2e
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type ElectronApplication, _electron as electron, expect, test } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(here, '..')
const appDir = path.join(webRoot, 'release', 'win-unpacked')

const enabled = process.env.VS_E2E_REAL_JOB === '1'
const testInput = path.resolve(webRoot, '..', 'test_input', 'When_You_Wish_Upon_a_Star.mp3')

let app: ElectronApplication | null = null
let outRoot = ''

test.skip(!enabled, '设 VS_E2E_REAL_JOB=1 才跑真实推理')

test.beforeAll(async () => {
  outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-e2e-'))
  const exe = fs
    .readdirSync(appDir)
    .filter((f) => f.endsWith('.exe'))
    .map((f) => path.join(appDir, f))
    .find((f) => !f.includes('python') && fs.statSync(f).size > 1_000_000)
  if (!exe) throw new Error('找不到主 exe，先跑 pnpm dist:dir')

  app = await electron.launch({
    executablePath: exe,
    cwd: appDir,
    env: { ...process.env, VS_OUT: outRoot },
  })
  await app.firstWindow({ timeout: 60_000 })
})

test.afterAll(async () => {
  await app?.close()
  app = null
  if (outRoot) fs.rmSync(outRoot, { recursive: true, force: true })
})

test('上传 → 去混响 → 产物齐全', async () => {
  // 推理本身 60–90 秒，加上启动和轮询，给足 4 分钟
  test.setTimeout(240_000)
  const win = await app!.firstWindow()

  // 1. 上传
  const bytes = Array.from(fs.readFileSync(testInput))
  const up = await win.evaluate(
    async (data) =>
      window.vs.rpc({
        method: 'POST',
        path: '/upload',
        body: { name: 'e2e.mp3', data },
      }),
    bytes,
  )
  expect(up.ok).toBe(true)
  if (!up.ok) return

  const inputName = (up.data as { path: string }).path.split(/[\\/]/).pop()!

  // 2. 建任务
  const job = await win.evaluate(
    async (name) =>
      window.vs.rpc({
        method: 'POST',
        path: '/jobs',
        body: {
          mode: 'dereverb',
          source: 'vocals',
          filename: 'e2e.mp3',
          inputName: name,
          options: { bigshifts: 1, parallel: 1, noMp3: true, noEnsemble: true },
        },
      }),
    inputName,
  )
  expect(job.ok).toBe(true)
  if (!job.ok) return
  const jobId = (job.data as { id: string }).id

  // 3. 轮询到结束（推理 60–90 秒，给 4 分钟）
  let status = 'running'
  let error: string | null = null
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const st = await win.evaluate(
      async (id) => window.vs.rpc({ method: 'GET', path: `/jobs/${id}` }),
      jobId,
    )
    if (!st.ok) continue
    const data = st.data as { status: string; error: string | null }
    if (data.status === 'done' || data.status === 'failed') {
      status = data.status
      error = data.error
      break
    }
  }

  expect(status, error ?? undefined).toBe('done')

  // 4. 读产物
  const res = await win.evaluate(
    async (id) => window.vs.rpc({ method: 'GET', path: `/jobs/${id}/result` }),
    jobId,
  )
  expect(res.ok).toBe(true)
  if (!res.ok) return

  const stems = (res.data as { stems: { name: string; url: string }[] }).stems
  expect(stems.length).toBeGreaterThanOrEqual(2)
  expect(stems.some((s) => s.name.includes('去混响'))).toBe(true)
  expect(stems.some((s) => s.name.includes('混响成分'))).toBe(true)
  // 每个产物都要有 vs-media:// 地址
  for (const s of stems) {
    expect(s.url.startsWith('vs-media://')).toBe(true)
  }
})

test('日志已落库', async () => {
  const win = await app!.firstWindow()
  const list = await win.evaluate(async () => window.vs.rpc({ method: 'GET', path: '/jobs' }))
  expect(list.ok).toBe(true)
  if (!list.ok) return
  const jobs = list.data as { id: string }[]
  expect(jobs.length).toBeGreaterThan(0)

  const logs = await win.evaluate(
    async (id) => window.vs.rpc({ method: 'GET', path: `/jobs/${id}/logs` }),
    jobs[0]!.id,
  )
  expect(logs.ok).toBe(true)
  if (!logs.ok) return
  const lines = (logs.data as { lines: string[] }).lines
  expect(lines.length).toBeGreaterThan(0)
  expect(lines.some((l) => l.includes('去混响'))).toBe(true)
})
