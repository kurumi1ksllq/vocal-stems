// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
/**
 * 包门面。
 *
 * 注意 callable 和 sidecar-contract 都定义了 CreateJobInput ——
 * 前者是 ZOD 校验后的入参，后者是路由注入 sidecar 时的接口。两者同形，
 * 但来源不同，这里显式挑一个（以 callable 为准，它才是对外契约）。
 */
export {
  type AppDeps,
  type CallableType,
  type CreateJobInput,
  createApp,
} from './callable/index.ts'
export type { Job, JobLog, JobOptionsJson, RendererError, Stem } from './db/schema.ts'
export * from './ipc.ts'
export type {
  HealthInfo,
  JobOptions,
  JobView,
  LibraryEntry,
  ResultDir,
  SidecarApi,
  StemView,
  UploadedFile,
  WeightEntry,
} from './sidecar-contract.ts'
