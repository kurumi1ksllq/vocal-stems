/**
 * 自定义媒体协议 vs-media://
 *
 * 渲染进程不能直接读文件系统，产物音频必须经协议暴露。
 * 只允许 <outRoot> 下的路径 —— 这是唯一的越权面，必须严格校验。
 */
import fs from 'node:fs'
import path from 'node:path'
import { protocol } from 'electron'

export const MEDIA_SCHEME = 'vs-media'

/** 必须在 app.whenReady() 之前调用。 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
      },
    },
  ])
}

const MIME: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
}

/**
 * 挂协议处理器。必须在 app.whenReady() 之后调用。
 *
 * URL 形式：vs-media://local/<encodeURIComponent(绝对路径)>
 * 用 encodeURIComponent 而不是把路径塞进 pathname，是为了绕开
 * 中文/空格/drive letter 在 URL 里的各种转义坑。
 */
export function handleMediaProtocol(getOutRoot: () => string): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    // host 固定是 local，pathname 是 '/' + encodeURIComponent(absPath)
    const encoded = url.pathname.replace(/^\/+/, '')
    let target: string
    try {
      target = decodeURIComponent(encoded)
    } catch {
      return new Response('bad path', { status: 400 })
    }

    const outRoot = path.resolve(getOutRoot())
    const resolved = path.resolve(target)
    if (!isInside(resolved, outRoot)) {
      return new Response('forbidden', { status: 403 })
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return new Response('not found', { status: 404 })
    }

    const ext = path.extname(resolved).toLowerCase()
    const type = MIME[ext]
    if (!type) return new Response('unsupported', { status: 415 })

    const stat = fs.statSync(resolved)
    const range = request.headers.get('range')

    // 音频拖动进度条需要 Range 支持，否则只能顺序播放
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (m) {
        const start = m[1] ? Number(m[1]) : 0
        const end = m[2] ? Number(m[2]) : stat.size - 1
        if (start >= stat.size || end >= stat.size || start > end) {
          return new Response('range not satisfiable', {
            status: 416,
            headers: { 'content-range': `bytes */${stat.size}` },
          })
        }
        const stream = fs.createReadStream(resolved, { start, end })
        return new Response(stream as unknown as ReadableStream, {
          status: 206,
          headers: {
            'content-type': type,
            'accept-ranges': 'bytes',
            'content-range': `bytes ${start}-${end}/${stat.size}`,
            'content-length': String(end - start + 1),
          },
        })
      }
    }

    const stream = fs.createReadStream(resolved)
    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        'content-type': type,
        'accept-ranges': 'bytes',
        'content-length': String(stat.size),
      },
    })
  })
}

/** 拼一个能被协议解析的 URL。 */
export function mediaUrl(absPath: string): string {
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(absPath)}`
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}
