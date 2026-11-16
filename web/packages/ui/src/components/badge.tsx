// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '../lib/utils.ts'

/**
 * 胶囊标签。
 *
 * iOS 的 badge 是 tinted capsule：极低饱和的底色 + 同色文字。
 * 这里所有颜色都从那几个系统色派生，不另造色值，页面才不会变成配色粥。
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 whitespace-nowrap font-display text-caption2 font-medium [&_svg]:size-2.5',
  {
    variants: {
      variant: {
        default: 'bg-white/10 text-foreground/90',
        secondary: 'bg-white/7 text-muted-foreground',
        outline: 'border border-white/14 text-muted-foreground',
        success: 'bg-stem-inst/16 text-stem-inst',
        warning: 'bg-stem-vocal/16 text-stem-vocal',
        danger: 'bg-destructive/18 text-destructive',
        info: 'bg-tint/18 text-tint',
        violet: 'bg-stem-backing/16 text-stem-backing',
        teal: 'bg-stem-inst/16 text-stem-inst',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
