// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import type * as React from 'react'
import { cn } from '../lib/utils.ts'

/**
 * 玻璃面板。
 *
 * 这是一个 sheet / 卡片，对应 iOS 的 grouped inset 容器：
 * 24px 圆角、半透明白、30px 模糊 + 饱和度提升、顶部 1px 内高光。
 *
 * 厚度来自「内高光 + 落影」，不是来自更亮的底色——
 * 靠底色堆明度就是上一版脏的原因。
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'glass border-white/10 flex flex-col gap-0 overflow-hidden rounded-[24px] border',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1 px-5 pt-4 pb-3', className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'font-display text-subhead leading-tight font-semibold tracking-tight',
        className,
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-caption leading-relaxed', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-5', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-5 pt-3 pb-4', className)}
      {...props}
    />
  )
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
