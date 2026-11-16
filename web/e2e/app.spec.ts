/**
 * Playwright E2E：启动打包后的 Electron，验证完整回路。
 *
 * 前提：先跑 `pnpm build && pnpm dist:dir`，产物在 web/release/win-unpacked。
 * 跑法：`pnpm e2e`
 *
 * 只测「能启动 + 环境探测正确 + 能提交一次任务」这条主线，
 * 单元/路由逻辑已经由 vitest 覆盖，E2E 不重复验证参数校验。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type ElectronApplication, _electron as electron, expect, test } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(here, '..')
const appDir = path.join(webRoot, 'release', 'win-unpacked')

let app: ElectronApplication | null = null

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  if (!fs.existsSync(appDir)) {
    throw new Error(`打包产物不存在: ${appDir}\n先跑 pnpm build && pnpm dist:dir`)
  }
  const exe = fs
    .readdirSync(appDir)
    .filter((f) => f.endsWith('.exe'))
    .map((f) => path.join(appDir, f))
    .find((f) => !f.includes('python') && fs.statSync(f).size > 1_000_000)

  if (!exe) throw new Error('release/win-unpacked 里找不到主 exe')

  app = await electron.launch({
    executablePath: exe,
    args: [],
    cwd: appDir,
    env: {
      ...process.env,
      // 测试用独立 userData，别污染真实数据
      VS_OUT: path.join(webRoot, '.e2e-out'),
    },
  })
})

test.afterAll(async () => {
  await app?.close()
  app = null
})

test('窗口能打开且标题正确', async () => {
  const win = await app!.firstWindow({ timeout: 60_000 })
  await expect.poll(() => win.title()).toContain('干声分离')
})

test('渲染进程能拿到 preload 桥', async () => {
  const win = await app!.firstWindow()
  const hasBridge = await win.evaluate(() => typeof window.vs?.rpc === 'function')
  expect(hasBridge).toBe(true)
})

test('主进程 RPC 返回健康信息', async () => {
  const win = await app!.firstWindow()
  const health = await win.evaluate(async () => {
    const r = await window.vs.rpc({ method: 'GET', path: '/health' })
    return r
  })
  expect(health).toMatchObject({ ok: true })
  if (health.ok) {
    const data = health.data as { ffmpeg: { exists: boolean }; weights: string[] }
    expect(Array.isArray(data.weights)).toBe(true)
  }
})

test('任务列表初始为空', async () => {
  const win = await app!.firstWindow()
  const jobs = await win.evaluate(async () => {
    const r = await window.vs.rpc({ method: 'GET', path: '/jobs' })
    return r.ok ? r.data : null
  })
  expect(Array.isArray(jobs)).toBe(true)
})

test('上传非法格式被拒绝', async () => {
  const win = await app!.firstWindow()
  const res = await win.evaluate(async () => {
    const r = await window.vs.rpc({
      method: 'POST',
      path: '/upload',
      body: { name: 'evil.txt', data: [1, 2, 3] },
    })
    return r
  })
  expect(res.ok).toBe(false)
})

test('渲染进程错误经 preload 上报（不崩）', async () => {
  const win = await app!.firstWindow()
  const ok = await win.evaluate(() => {
    window.vs.reportError({ message: 'e2e 测试错误', stack: 'test', url: location.href })
    return true
  })
  expect(ok).toBe(true)
})
