import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '../lib/utils.ts'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/15 text-primary',
        secondary: 'border-border/80 bg-secondary/70 text-secondary-foreground',
        outline: 'border-border text-muted-foreground',
        success: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-400',
        warning: 'border-amber-500/30 bg-amber-500/12 text-amber-400',
        danger: 'border-red-500/30 bg-red-500/12 text-red-400',
        info: 'border-sky-500/30 bg-sky-500/12 text-sky-400',
        violet: 'border-violet-500/30 bg-violet-500/12 text-violet-300',
        teal: 'border-teal-500/30 bg-teal-500/12 text-teal-300',
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
