/**
 * 数据库 schema（Drizzle + node:sqlite）
 *
 * 主权约定：只有 Node 主进程开这个库。渲染进程经 IPC 拿数据，
 * Python sidecar 完全不碰数据库文件。
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** 分离任务。一次拖入 = 一条记录。 */
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    /** stems | karaoke | dereverb */
    mode: text('mode').notNull(),
    /** mix | vocals | karaoke */
    source: text('source').notNull(),
    /** 用户原始文件名 */
    filename: text('filename').notNull(),
    /** 输入音频绝对路径（在主进程管理的 uploads 下） */
    inputPath: text('input_path').notNull(),
    /** queued | running | done | failed | cancelled */
    status: text('status').notNull().default('queued'),
    /** 产物目录绝对路径，完成后才有 */
    outputDir: text('output_dir'),
    exitCode: integer('exit_code'),
    error: text('error'),
    /** 结构化参数（bigshifts / parallel / fuse ...） */
    options: text('options', { mode: 'json' }).$type<JobOptionsJson>(),
    createdAt: integer('created_at').notNull(),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [index('jobs_created_at_idx').on(t.createdAt)],
)

/** 一条任务产出的每一轨（含融合结果）。 */
export const stems = sqliteTable(
  'stems',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    /** 文件绝对路径 */
    path: text('path').notNull(),
    /** 展示名，如「干声（去混响）」 */
    label: text('label').notNull(),
    /** vocal | inst | backing | reverb | dereverb | other */
    kind: text('kind').notNull(),
    /** 是否融合产物 */
    fused: integer('fused', { mode: 'boolean' }).notNull().default(false),
    /** 融合算法名，非融合为 null */
    fuseMode: text('fuse_mode'),
    size: integer('size').notNull().default(0),
  },
  (t) => [index('stems_job_idx').on(t.jobId)],
)

/** 任务运行日志，一行一条。 */
export const jobLogs = sqliteTable(
  'job_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    line: text('line').notNull(),
    at: integer('at').notNull(),
  },
  (t) => [index('job_logs_job_seq_idx').on(t.jobId, t.seq)],
)

/** 渲染进程上报的错误（preload 管道写入，主进程落库 + electron-log）。 */
export const rendererErrors = sqliteTable(
  'renderer_errors',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    message: text('message').notNull(),
    stack: text('stack'),
    componentStack: text('component_stack'),
    url: text('url'),
    at: integer('at').notNull(),
  },
  (t) => [index('renderer_errors_at_idx').on(t.at)],
)

export interface JobOptionsJson {
  bigshifts: number
  parallel: number
  fuse?: string
  noMp3?: boolean
  noEnsemble?: boolean
}

export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type Stem = typeof stems.$inferSelect
export type NewStem = typeof stems.$inferInsert
export type JobLog = typeof jobLogs.$inferSelect
export type RendererError = typeof rendererErrors.$inferSelect
