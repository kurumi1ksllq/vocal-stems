// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
/**
 * 数据库句柄。
 *
 * 纪律：node:sqlite 不可跨进程传递，所以这个模块只在主进程被 import。
 * 迁移在启动时同步执行（迁移文件由 drizzle-kit generate 产出到
 * packages/shared/drizzle/）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { type AppDb, createDb } from '@vs/shared/db'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'

export interface DbHandle {
  db: AppDb
  close(): void
}

export function openDb(userDataDir: string, migrationsFolder: string): DbHandle {
  fs.mkdirSync(userDataDir, { recursive: true })
  const file = path.join(userDataDir, 'app.db')
  const db = createDb(file)

  // 迁移目录可能不存在（还没 generate 过），这时跳过而不是崩
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder })
  }

  return {
    db,
    close: () => {
      // Drizzle 包装的 DatabaseSync 没有公开 close，直接引用底层 client
      const client = (db as unknown as { $client?: { close?: () => void } }).$client
      client?.close?.()
    },
  }
}
