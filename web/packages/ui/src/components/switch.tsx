// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
'use client'

import * as SwitchPrimitive from '@radix-ui/react-switch'
import type * as React from 'react'
import { cn } from '../lib/utils.ts'

/**
 * iOS 开关：51×31 的胶囊，拇指是白色圆片 + 轻投影。
 * 关闭态是白色 16% 的玻璃槽，开启态是系统绿。
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border border-white/10 transition-colors duration-200 outline-none disabled:cursor-not-allowed disabled:opacity-35 data-[state=checked]:border-transparent data-[state=checked]:bg-[#30d158] data-[state=unchecked]:bg-white/16',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[22px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.3),0_1px_1px_rgba(0,0,0,0.16)] transition-transform duration-200 data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-[2px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
