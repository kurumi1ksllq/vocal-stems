// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import { Button } from '@vs/ui/components/button'
import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="window-in flex flex-col items-center gap-2.5 py-24 text-center">
      <p className="text-muted-foreground/50 font-display text-caption2">404</p>
      <p className="text-title3">这个地址没有对应页面。</p>
      <p className="text-muted-foreground text-footnote">可能是链接旧了，或者页面已经删掉。</p>
      <Button asChild size="sm" variant="secondary" className="mt-2">
        <Link to="/">回到分离台</Link>
      </Button>
    </div>
  )
}
