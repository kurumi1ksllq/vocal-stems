// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
'use client'

import * as LabelPrimitive from '@radix-ui/react-label'
import type * as React from 'react'
import { cn } from '../lib/utils.ts'

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-footnote leading-none font-medium text-foreground/92 select-none',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
