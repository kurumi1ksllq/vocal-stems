// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
import type { Story, StoryDefault } from '@ladle/react'
import { Badge } from './badge.tsx'
import { Button } from './button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card.tsx'
import { Label } from './label.tsx'
import { Progress } from './progress.tsx'
import { Separator } from './separator.tsx'
import { Switch } from './switch.tsx'

/** Ladle 没有全局 wrapper，这里手动给个暗色底。 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark bg-background text-foreground min-h-screen p-8">
      <div className="mx-auto max-w-2xl space-y-6">{children}</div>
    </div>
  )
}

export default {
  title: 'UI / Overview',
} satisfies StoryDefault

export const Buttons: Story = () => (
  <Frame>
    <div className="flex flex-wrap gap-2">
      <Button>默认</Button>
      <Button variant="secondary">次要</Button>
      <Button variant="outline">描边</Button>
      <Button variant="ghost">幽灵</Button>
      <Button variant="destructive">危险</Button>
      <Button variant="link">链接</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm">sm</Button>
      <Button size="default">default</Button>
      <Button size="lg">lg</Button>
      <Button size="icon-sm" aria-label="图标按钮">
        ×
      </Button>
    </div>
    <div className="flex gap-2">
      <Button disabled>禁用</Button>
      <Button variant="secondary" disabled>
        禁用次要
      </Button>
    </div>
  </Frame>
)

export const Badges: Story = () => (
  <Frame>
    <div className="flex flex-wrap gap-2">
      {(
        [
          'default',
          'secondary',
          'outline',
          'success',
          'warning',
          'danger',
          'info',
          'violet',
          'teal',
        ] as const
      ).map((v) => (
        <Badge key={v} variant={v}>
          {v}
        </Badge>
      ))}
    </div>
  </Frame>
)

export const Cards: Story = () => (
  <Frame>
    <Card>
      <CardHeader>
        <CardTitle>去混响</CardTitle>
        <CardDescription>把混响尾巴从人声里剥出来</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="s1">跳过融合</Label>
          <Switch id="s1" defaultChecked />
        </div>
        <Progress value={62} />
      </CardContent>
    </Card>
  </Frame>
)

export const Form: Story = () => (
  <Frame>
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="name">文件名</Label>
        <input
          id="name"
          defaultValue="example.wav"
          className="border-border/70 bg-background/60 h-8 w-full rounded-md border px-2.5 text-[12px] outline-none"
        />
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <Label htmlFor="s2">并行进程</Label>
        <Switch id="s2" />
      </div>
    </div>
  </Frame>
)

export const ProgressStates: Story = () => (
  <Frame>
    <div className="space-y-4">
      {[0, 25, 62, 100].map((v) => (
        <div key={v} className="space-y-1">
          <span className="text-muted-foreground text-[11px]">{v}%</span>
          <Progress value={v} />
        </div>
      ))}
    </div>
  </Frame>
)
