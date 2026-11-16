import { Button } from '@vs/ui/components/button'
import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="text-muted-foreground font-mono text-[11px]">404</p>
      <p className="text-[15px] font-medium">这个页面不存在</p>
      <p className="text-muted-foreground text-[12px]">可能是地址写错了，或者页面已被移除。</p>
      <Button asChild size="sm" variant="secondary" className="mt-1">
        <Link to="/">回到分离台</Link>
      </Button>
    </div>
  )
}
