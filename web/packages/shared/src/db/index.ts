/**
 * Drizzle 实例工厂。
 *
 * 只由主进程调用 —— `node:sqlite` 的 DatabaseSync 不可跨进程传递，
 * 所以在 preload / renderer 里 import 这个文件会直接抛错（这是故意的）。
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import * as schema from './schema.ts'

export type AppDb = ReturnType<typeof createDb>

export function createDb(filename: string) {
  const sqlite = new DatabaseSync(filename)
  // WAL 让读写不互相阻塞；主进程单写多读够用
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec('PRAGMA busy_timeout = 5000')
  return drizzle({ client: sqlite, schema })
}

export { schema }
