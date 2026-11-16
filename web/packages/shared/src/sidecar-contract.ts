// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
/**
 * 主进程给 Hono 路由注入的 sidecar 接口。
 *
 * 单独抽一个文件是为了避免 shared/callable 直接依赖 node:sqlite 以外的
 * Node 内建，类型层面保持干净（渲染进程只 import type）。
 */
import type { Job, NewStem, Stem } from './db/schema.ts'

export interface JobOptions {
  bigshifts: number
  parallel: number
  fuse?: string
  noMp3: boolean
  noEnsemble: boolean
}

export interface CreateJobInput {
  mode: 'stems' | 'karaoke' | 'dereverb'
  source: 'mix' | 'vocals' | 'karaoke'
  filename: string
  inputName: string
  options: JobOptions
}

export interface JobView {
  id: string
  mode: string
  source: string
  filename: string
  status: string
  outDir: string | null
  exitCode: number | null
  error: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  elapsed: number
}

export interface StemView {
  name: string
  path: string
  label: string
  kind: string
  fused: boolean
  fuseMode: string | null
  size: number
  /** vs-media:// 可播放地址 */
  url: string
  mp3Url: string | null
}

export interface ResultDir {
  dir: string
  name: string
  mtime: number
  stems: StemView[]
}

export interface LibraryEntry {
  name: string
  dir: string
  mtime: number
  count: number
  size: number
}

export interface WeightEntry {
  name: string
  size: number
  mtime: number
}

export interface HealthInfo {
  ok: boolean
  root: string
  python: string
  cuda: { available: boolean; device: string | null }
  cpuFallback: boolean
  ffmpeg: { path: string | null; exists: boolean }
  weights: string[]
  outRoot: string
  modelsDir: string
  version: string
}

export interface UploadedFile {
  name: string
  path: string
  size: number
}

/** 主进程实现的 sidecar 能力集合。Hono 路由只依赖这个接口。 */
export interface SidecarApi {
  probe(): Promise<HealthInfo>
  createJob(input: CreateJobInput, now: number): Promise<JobView>
  listJobs(limit: number): Promise<JobView[]>
  getJob(id: string): Promise<JobView | null>
  cancelJob(id: string): Promise<boolean>
  deleteJob(id: string): Promise<void>
  getLogs(id: string): Promise<string[]>
  getResult(id: string): Promise<ResultDir | null>
  saveUpload(name: string, data: Uint8Array): Promise<UploadedFile>
  listLibrary(): Promise<LibraryEntry[]>
  readOutDir(dir: string): Promise<ResultDir | null>
  listWeights(): Promise<WeightEntry[]>
  reveal(path: string): Promise<boolean>
}

export type { Job, NewStem, Stem }
