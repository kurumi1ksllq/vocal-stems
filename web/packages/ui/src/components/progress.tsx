// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
'use client'

import * as ProgressPrimitive from '@radix-ui/react-progress'
import type * as React from 'react'
import { cn } from '../lib/utils.ts'

/** 细胶囊进度条，iOS 的样式：3px、全圆角、tint 填充。 */
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn('relative h-[3px] w-full overflow-hidden rounded-full bg-white/12', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-tint h-full w-full flex-1 rounded-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
