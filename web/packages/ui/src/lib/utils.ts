// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge 不认识我们自定义的字号（text-caption 之类），
 * 会把 `text-caption` 当成颜色类，跟同一元素上的 `text-primary-foreground`
 * 判成冲突，然后丢掉后者——结果就是白底按钮上出现白字。
 *
 * 这里把自定义字号显式登记进 font-size 组，冲突判定才对。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['caption2', 'caption', 'footnote', 'subhead', 'body', 'title3', 'title1'] },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB'] as const
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const v = bytes / 1024 ** i
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatRelative(ts: number): string {
  const diff = Date.now() / 1000 - ts / 1000
  if (diff < 45) return '刚刚'
  if (diff < 3600) return `${Math.round(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.round(diff / 3600)} 小时前`
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (diff < 172800) return `昨天 ${hh}:${mm}`
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${hh}:${mm}`
}
