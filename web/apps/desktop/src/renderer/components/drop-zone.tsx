// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { Button } from '@vs/ui/components/button'
import { cn, formatBytes } from '@vs/ui/lib/utils'
import { Plus } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

const ACCEPT = '.wav,.mp3,.flac,.m4a,.aac,.ogg,.opus,.wma,.aiff,.aif,.ape,.mp4,.mkv,.mov,audio/*'

interface DropZoneProps {
  file: File | null
  onFile: (file: File | null) => void
  disabled?: boolean
}

/**
 * 拖拽 + 点选。整块由原生 button 承载，键盘和拖放都走同一个元素。
 * 只做本地校验（扩展名），真正的解码交给 Python 侧。
 *
 * 视觉是 iOS 的 inset field：比玻璃更暗的一层，虚线只在拖拽时出现。
 */
export function DropZone({ file, onFile, disabled }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [reject, setReject] = useState<string | null>(null)

  const accept = useCallback(
    (f: File | undefined | null) => {
      if (!f) return
      const dot = f.name.lastIndexOf('.')
      const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : ''
      if (!ext || !ACCEPT.includes(ext)) {
        setReject(`这个格式不行：${ext || '无扩展名'}`)
        return
      }
      setReject(null)
      onFile(f)
    },
    [onFile],
  )

  const clear = () => {
    onFile(null)
    setReject(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'well relative rounded-[16px] transition-all duration-200',
          dragging && 'ring-2 ring-tint/60',
          disabled && 'opacity-50',
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            if (!disabled) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (disabled) return
            accept(e.dataTransfer.files?.[0])
          }}
          aria-label={file ? `${file.name}，点击更换文件` : '选择或拖入音频文件'}
          className={cn(
            'flex min-h-[124px] w-full cursor-pointer flex-col items-center justify-center gap-2 px-4 py-5 text-center outline-none',
            disabled && 'pointer-events-none',
          )}
        >
          {file ? (
            <>
              <span className="text-tint flex size-9 items-center justify-center rounded-full bg-white/10">
                <span className="font-display text-caption font-semibold">WAV</span>
              </span>
              <span
                className="text-subhead max-w-full truncate leading-snug font-medium"
                title={file.name}
              >
                {file.name}
              </span>
              <span className="readout text-muted-foreground">{formatBytes(file.size)}</span>
            </>
          ) : (
            <>
              <span className="text-tint flex size-9 items-center justify-center rounded-full bg-tint/16">
                <Plus className="size-4" />
              </span>
              <span className="text-subhead font-medium">添加音频</span>
              <span className="text-muted-foreground text-caption">拖进来，或点一下选文件</span>
              <span className="readout text-muted-foreground/70">wav · mp3 · flac · m4a · ogg</span>
            </>
          )}
        </button>

        {file && !disabled && (
          <div className="absolute top-2 right-2">
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              移除
            </Button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>

      {reject && <p className="text-destructive px-1 text-caption2">{reject}</p>}
    </div>
  )
}
