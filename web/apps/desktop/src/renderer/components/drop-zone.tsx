import { Button } from '@vs/ui/components/button'
import { cn, formatBytes } from '@vs/ui/lib/utils'
import { FileAudio, Upload, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

const ACCEPT = '.wav,.mp3,.flac,.m4a,.aac,.ogg,.opus,.wma,.aiff,.aif,.ape,.mp4,.mkv,.mov,audio/*'

interface DropZoneProps {
  file: File | null
  onFile: (file: File | null) => void
  disabled?: boolean
}

/**
 * 拖拽 + 点选。整块由原生 button 承载，键盘和拖放都走同一个元素。
 * 只做本地校验（扩展名），真正的解码交给后端。
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
        setReject(`不支持 ${ext || '这个格式'}，请选 wav / mp3 / flac 等音频`)
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
          'rounded-xl border-2 border-dashed transition-all',
          dragging
            ? 'border-primary bg-primary/8 scale-[1.01]'
            : 'border-border/70 bg-background/30 hover:border-border hover:bg-background/50',
          disabled && 'opacity-50',
          file && 'border-solid border-primary/40 bg-primary/5',
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
            'flex min-h-[168px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl p-6 text-center outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring/40',
            disabled && 'pointer-events-none',
          )}
        >
          {file ? (
            <>
              <div className="bg-primary/12 text-primary flex size-11 items-center justify-center rounded-full">
                <FileAudio className="size-5" />
              </div>
              <div className="min-w-0 max-w-full space-y-0.5">
                <p className="truncate px-4 text-[13px] font-medium" title={file.name}>
                  {file.name}
                </p>
                <p className="text-muted-foreground font-mono text-[11px]">
                  {formatBytes(file.size)}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-secondary/70 text-muted-foreground flex size-11 items-center justify-center rounded-full">
                <Upload className="size-5" />
              </div>
              <div className="space-y-1">
                <p className="text-[13px] font-medium">把音频拖进来</p>
                <p className="text-muted-foreground text-[12px]">或点击选择文件</p>
              </div>
              <p className="text-muted-foreground/70 font-mono text-[10.5px]">
                wav · mp3 · flac · m4a · ogg
              </p>
            </>
          )}
        </button>

        {file && !disabled && (
          <div className="flex justify-center pb-3">
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              <X className="size-3.5" />
              换一个
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

      {reject && <p className="text-destructive text-[11.5px]">{reject}</p>}
    </div>
  )
}
