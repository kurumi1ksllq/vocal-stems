// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '../lib/utils.ts'

/**
 * 按钮。iOS 的按钮只有三种形态，这里一一对应：
 *
 *   default   prominent —— 近白胶囊 + 深色字，一屏只该有一个
 *   secondary tinted    —— 半透明填充胶囊，用在次要动作
 *   ghost     plain     —— 只有文字（蓝色 tint），用在小组件里
 *
 * 按下反馈是 scale(0.97)，不是位移——位移在触觉上是"跳"，缩放是"压"。
 */
const buttonVariants = cva(
  'pressable inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap outline-none select-none disabled:pointer-events-none disabled:opacity-30 [&_svg]:pointer-events-none [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_6px_18px_-8px_rgba(0,0,0,0.6)] hover:bg-primary/92',
        secondary:
          'border border-white/12 bg-secondary text-secondary-foreground backdrop-blur-xl hover:bg-accent disabled:bg-white/6 disabled:border-white/8',
        outline:
          'border border-white/18 bg-transparent text-foreground hover:bg-white/8 disabled:border-white/8',
        ghost: 'text-tint hover:bg-white/8',
        destructive:
          'bg-destructive/16 text-destructive hover:bg-destructive/24 disabled:bg-white/6 disabled:text-muted-foreground/70',
        link: 'text-tint underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-4 text-footnote has-[>svg]:px-3',
        sm: 'h-7 gap-1 px-3 text-caption has-[>svg]:px-2.5',
        lg: 'h-11 px-6 text-subhead has-[>svg]:px-5',
        icon: 'size-8',
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
